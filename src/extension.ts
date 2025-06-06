import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { Readable } from 'stream';
import { fetch } from 'undici';
import * as unzipper from 'unzipper';

import { getBinaryPath } from './utils/utils';
import { DebounceManager } from './utils/debounceManager';
import { startLangClient, getClient, stopLangClient } from './langClient';

const DEBOUNCE_DELAY = 500; // ms
const VALIDATOR_KILL_TIMEOUT = 5000;

async function setupBinaries(extensionPath: string): Promise<void> {
	const archMap: Record<string, string> = {
		'x64': 'x86_64',
		'arm64': 'aarch64',
	};

	const osMap: Record<string, string> = {
		'linux': 'linux-musl',
		'darwin': 'macos',
		'win32': 'windows',
	};

	const platform = os.platform(); // 'win32' | 'linux' | 'darwin'
	const arch = os.arch();         // 'x64' | 'arm64'

	// TODO: glslang binary releases use different mapping such as "osx" not "macos"
	const mappedArch = archMap[arch];
	const mappedOS = osMap[platform];

	if (!mappedArch || !mappedOS) {
		vscode.window.showErrorMessage(`Unsupported platform or architecture: ${platform} ${arch}`);
		return;
	}

	const binDir = path.join(extensionPath, 'bin');

	const glslangValidatorSource = `bin/glslangValidator${platform === 'win32' ? '.exe' : ''}`;
	const glslangValidatorTarget = path.join(binDir, 'glslangValidator', `glslangValidator-${mappedOS}${platform === 'win32' ? '.exe' : ''}`);
	const glslAnalyzerSource = `bin/glsl_analyzer${platform === 'win32' ? '.exe' : ''}`;
	const glslAnalyzerTarget = path.join(binDir, 'glsl_analyzer', `glsl_analyzer-${mappedArch}-${mappedOS}${platform === 'win32' ? '.exe' : ''}`);
	// console.log("glslangValidatorSource:", glslangValidatorSource);
	// console.log("glslangValidatorTarget:", glslangValidatorTarget);
	// console.log("glslangValidator test url:", `https://github.com/KhronosGroup/glslang/releases/download/main-tot/glslang-${platform === 'win32' ? 'master' : 'main'}-${mappedOS}-Release.zip`);
	// console.log("glslAnalyzerSource:", glslAnalyzerSource);
	// console.log("glslAnalyzerTarget:", glslAnalyzerTarget);
	// console.log("glslAnalyzer test url:", `https://github.com/nolanderc/glsl_analyzer/releases/download/v1.6.0/${mappedArch}-${mappedOS}.zip`);

	// Check glslangValidator
	await ensureBinaryExists(glslangValidatorTarget, () =>
		downloadAndExtract(
			`https://github.com/KhronosGroup/glslang/releases/download/main-tot/glslang-${platform === 'win32' ? 'master' : 'main'}-${mappedOS}-Release.zip`,
			glslangValidatorTarget,
			glslangValidatorSource
		)
	);

	// Check glsl_analyzer
	await ensureBinaryExists(glslAnalyzerTarget, () =>
		downloadAndExtract(
			`https://github.com/nolanderc/glsl_analyzer/releases/download/v1.6.0/${mappedArch}-${mappedOS}.zip`,
			glslAnalyzerTarget,
			glslAnalyzerSource
		)
	);
}

async function ensureBinaryExists(binaryPath: string, onMissing: () => Promise<void>) {
	if (fs.existsSync(binaryPath)) {
		console.log(`${binaryPath} exists, great.`);
		return
	};

	console.log(`${binaryPath} does not exist, procure it.`);

	fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
	await onMissing();
	fs.chmodSync(binaryPath, 0o755);
}

async function downloadAndExtract(zipUrl: string, extractToPath: string, sourcePath: string): Promise<void> {
	const res = await fetch(zipUrl, { redirect: 'follow' });

	if (!res.ok || !res.body) {
		throw new Error(`Failed to download from ${zipUrl}: ${res.status}`);
	}

	const nodeReadable = Readable.fromWeb(res.body);	// Have to convert to a Node Readable

	await new Promise<void>((resolve, reject) => {
		nodeReadable
			.pipe(unzipper.Parse())
			.on('entry', async (entry) => {
				const filePath = entry.path.replace(/\\/g, '/'); // Normalize to forward slashes

				if (filePath.endsWith(sourcePath)) {
					// Extract only the target file if there are subfolders, e.g. in the case of glslangValidator
					entry.pipe(fs.createWriteStream(extractToPath))
						.on('finish', resolve)
						.on('error', reject);
				} else {
					// Skip all others
					entry.autodrain();
				}
			})
			.on('error', reject)
			.on('close', () => {
				reject(new Error(`File not found in archive.`));
			});
	});
}

function injectThreeJSBuiltIns(code: string, shaderStage: string): string {
	const commonVertexUniforms = `
	uniform mat4 modelMatrix;
	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	uniform mat4 viewMatrix;
	uniform mat3 normalMatrix;
	uniform vec3 cameraPosition;

	in vec3 position;
	in vec3 normal;
	in vec2 uv;
	`;

	const commonFragmentUniforms = `
	uniform mat4 viewMatrix;
	uniform vec3 cameraPosition;
	`;

	if (shaderStage === 'vert') {
		return commonVertexUniforms + '\n' + code;
	} else if (shaderStage === 'frag') {
		return commonFragmentUniforms + '\n' + code;
	} else {
		return code;
	}
}

function patchGlsl(code: string, shaderStage: string): string {
	if (shaderStage === 'frag') {
		return '#version 300 es\nprecision mediump float;\n' + injectThreeJSBuiltIns(code, shaderStage);
	} else {
		return '#version 300 es\n' + injectThreeJSBuiltIns(code, shaderStage);
	}
}

function validateGLSLDocumentViaStdin(
	document: vscode.TextDocument,
	extensionPath: string,
	diagnosticCollection: vscode.DiagnosticCollection,
	killTimeout: number
) {
	const text = document.getText();
	const validatorPath = getBinaryPath('glslangValidator');
	const validatorFullPath = path.join(extensionPath, validatorPath);
	const shaderStage = guessShaderStage(document.fileName);

	// --stdin tells glslangValidator to read from stdin
	// also --stdin requires -S, so it has to be before -S
	const args = ['--stdin', '-S', shaderStage];
	const proc = cp.spawn(validatorFullPath, args);

	// A killer function to kill the child proc if taken too long
	const killTimer = setTimeout(() => {
		if (!proc.killed) {
			console.warn('Killing glslangValidator process due to timeout');
			proc.kill();
		}
	}, killTimeout);

	let output = '';
	proc.stdout.on('data', data => output += data.toString());
	proc.stderr.on('data', data => output += data.toString());

	proc.on('close', (code) => {
		clearTimeout(killTimer);
		console.log(`glslangValidator exited with code ${code}`);
		console.log(`glslangValidator output ${output}`);
		processValidatorOutput(document, output, diagnosticCollection);
	});

	proc.on('error', (err) => {
		clearTimeout(killTimer);
		console.error('Failed to start glslangValidator process:', err);
		vscode.window.showErrorMessage(`glslangValidator failed: ${err.message}`);
	});

	// Write the current in-memory text to stdin
	if (!text.trim().startsWith('#version')) {
		// Inject version if none detected
		let patchedText = patchGlsl(text, shaderStage);
		proc.stdin.write(patchedText);
	} else {
		proc.stdin.write(text);
	}
	proc.stdin.end();
}

function guessShaderStage(filePath: string): string {
	if (filePath.endsWith('.vert') || filePath.endsWith('vs.glsl')) return 'vert';
	if (filePath.endsWith('.frag') || filePath.endsWith('fs.glsl')) return 'frag';
	if (filePath.endsWith('.comp')) return 'comp';
	return 'frag'; // default
}

function processValidatorOutput(
	document: vscode.TextDocument,
	output: string,
	diagnosticCollection: vscode.DiagnosticCollection
) {
	const diagnostics: vscode.Diagnostic[] = [];
	const lines = output.split(/\r?\n/);

	for (const line of lines) {
		const match = line.match(/ERROR:\s.*:(\d+):\s(.*)/);
		if (match) {
			const lineNumber = parseInt(match[1]) - 1;
			const message = match[2].trim();

			const range = new vscode.Range(lineNumber, 0, lineNumber, Number.MAX_SAFE_INTEGER);
			const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
			diagnostics.push(diagnostic);
		}
	}

	diagnosticCollection.set(document.uri, diagnostics);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "glsl-int" is now active AAAA!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('glsl-int.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello VS Code 234!');
	});

	context.subscriptions.push(disposable);

	// Automatic download binaries if not exist, bcz we do not bundle the binarie in this extension.
	try {
		await setupBinaries(context.extensionPath);
		console.log('Binary setup complete.');
	} catch (err) {
		console.error('Failed to setup binaries:', err);
		vscode.window.showErrorMessage(`glsl-int failed to set up binaries: ${(err as Error).message}`);
	}

	// Call helper function to start a language client talking with a glsl_analyzer server
	startLangClient(context);

	const diagnosticCollection = vscode.languages.createDiagnosticCollection('glsl');
	context.subscriptions.push(diagnosticCollection);
	const debounceManager = new DebounceManager(DEBOUNCE_DELAY);
	context.subscriptions.push(debounceManager);

	// Validate all open GLSL files at startup
	vscode.workspace.textDocuments.forEach((doc) => {
		if (doc.languageId === 'glsl') {
			validateGLSLDocumentViaStdin(doc, context.extensionPath, diagnosticCollection, VALIDATOR_KILL_TIMEOUT);
		}
	});

	// Validate on new file open
	// new file open means the file must not be already cached in memory, so like from a new workspace
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (doc.languageId === 'glsl') {
				validateGLSLDocumentViaStdin(doc, context.extensionPath, diagnosticCollection, VALIDATOR_KILL_TIMEOUT);
			}
		})
	);

	// Validate on current file save
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (doc.languageId === 'glsl') {
				validateGLSLDocumentViaStdin(doc, context.extensionPath, diagnosticCollection, VALIDATOR_KILL_TIMEOUT);
			}
		})
	);

	// Validate on current file changed, with debouncing to reduce the frequency of validation calls
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			const doc = e.document;
			if (doc.languageId !== 'glsl') return;

			// This will lookup the current file's timer in a timer array, reset it and
			// callback the validate GLSL function with approprieate arguments
			debounceManager.debounce(doc.uri.toString(), () => {
				validateGLSLDocumentViaStdin(doc, context.extensionPath, diagnosticCollection, VALIDATOR_KILL_TIMEOUT);
			});
		})
	);
}

// This method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
	await stopLangClient();
}
