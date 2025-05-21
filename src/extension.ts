import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

function getBinaryPath(tool: 'glsl_analyzer' | 'glslangValidator'): string {
	const platform = process.platform; // 'win32', 'darwin', 'linux'
	const arch = process.arch;         // 'x64', 'arm64'

	console.log(`Detected platform: ${platform}, architecture: ${arch}`);

	// Arch and platform mappings
	const archMap: Record<string, string> = {
		'x64': 'x86_64',
		'arm64': 'aarch64'
	};

	const platMap: Record<string, string> = {
		'win32': 'windows',
		'darwin': 'macos',
		'linux': 'linux'
	};

	const toolDir = tool; // matches folder name
	const toolName = tool; // base of binary file

	const archStr = archMap[arch];
	const platStr = platMap[platform];
	const ext = platform === 'win32' ? '.exe' : '';

	if (!archStr && tool === 'glsl_analyzer') {
		throw new Error(`Unsupported architecture for glsl_analyzer: ${arch}`);
	}

	if (!platStr) {
		throw new Error(`Unsupported platform: ${platform}`);
	}

	let binaryName: string;

	if (tool === 'glsl_analyzer') {
		// e.g. glsl_analyzer-x86_64-windows.exe
		binaryName = `${toolName}-${archStr}-${platStr}${ext}`;
	} else {
		// e.g. glslangValidator-windows.exe
		binaryName = `${toolName}-${platStr}${ext}`;
	}

	return path.join('bin', toolDir, binaryName);
}

function validateGLSLDocument(document: vscode.TextDocument, parentPath: string, diagnosticCollection: vscode.DiagnosticCollection, needTmp: boolean = false) {
	let filePath = document.fileName;
	const validatorPath = getBinaryPath('glslangValidator');
	const validatorFullPath = path.join(parentPath, validatorPath);
	// console.log(`validatorFullPath: ${validatorFullPath}`);

	// if need temp file, like on document change but not save, save a temp file
	// and use that file path for glslangValidator
	// TODO: This probably going to be retired bcz we have the stdin version already
	if (needTmp) {
		const tmpDir = os.tmpdir();
		const tmpPath = path.join(tmpDir, `vscode-glsl-${Date.now()}.vert`);
		console.log(`tmpPath: ${tmpPath}`);

		// Write the current buffer text files stream to a temp file
		fs.writeFileSync(tmpPath, document.getText(), 'utf8');
		filePath = tmpPath;
	}

	const proc = cp.spawn(validatorFullPath, ['-S', guessShaderStage(filePath), filePath]);

	let output = '';
	proc.stdout.on('data', (data) => output += data.toString());
	proc.stderr.on('data', (data) => output += data.toString());

	proc.on('close', () => {
		processValidatorOutput(document, output, diagnosticCollection);
	});

	proc.on('error', (err) => {
		console.error('Failed to start glslangValidator process:', err);
		vscode.window.showErrorMessage(`glslangValidator failed: ${err.message}`);
	});
}

function validateGLSLDocumentViaStdin(
	document: vscode.TextDocument,
	parentPath: string,
	diagnosticCollection: vscode.DiagnosticCollection
) {
	const text = document.getText();
	const validatorPath = getBinaryPath('glslangValidator');
	const validatorFullPath = path.join(parentPath, validatorPath);
	const shaderStage = guessShaderStage(document.fileName);

	// --stdin tells glslangValidator to read from stdin
	// also --stdin requires -S, so it has to be before -S
	const args = ['--stdin', '-S', shaderStage];
	console.log(`args: ${args}`);
	const proc = cp.spawn(validatorFullPath, args);

	let output = '';
	proc.stdout.on('data', data => output += data.toString());
	proc.stderr.on('data', data => output += data.toString());

	proc.on('close', (code) => {
		console.log(`glslangValidator exited with code ${code}`);
		console.log(`glslangValidator output ${output}`);
		processValidatorOutput(document, output, diagnosticCollection);
	});

	proc.on('error', (err) => {
		console.error('Failed to start glslangValidator process:', err);
		vscode.window.showErrorMessage(`glslangValidator failed: ${err.message}`);
	});

	// Write the current in-memory text to stdin
	proc.stdin.write(text);
	proc.stdin.end();
}

function guessShaderStage(filePath: string): string {
	if (filePath.endsWith('.vert')) return 'vert';
	if (filePath.endsWith('.frag')) return 'frag';
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

const validateTimeouts = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // ms

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "glsl-int" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('glsl-int.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello VS Code 234!');
	});

	context.subscriptions.push(disposable);

	try {
		const gaRelativePath = getBinaryPath('glsl_analyzer');
		console.log("glsl_analyzer Relative path:", gaRelativePath);
		const gvRelativePath = getBinaryPath('glslangValidator');
		console.log("glslangValidator Relative path:", gvRelativePath);
		const binaryFullPath = path.join(context.extensionPath, gaRelativePath);
		console.log("Attempting to start GLSL analyzer at", binaryFullPath);

		const serverOptions: ServerOptions = {
			command: binaryFullPath,
			args: ['--stdio'],
			options: {
				cwd: context.extensionPath
			}
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: 'file', language: 'glsl' }],
			outputChannel: vscode.window.createOutputChannel('GLSL Analyzer Output')
		};

		const client = new LanguageClient(
			'glslAnalyzer',
			'GLSL Analyzer Server',
			serverOptions,
			clientOptions
		);

		context.subscriptions.push(client);
		client.start();
	} catch (err: any) {
		console.error('Error launching glsl_analyzer:', err);
		vscode.window.showErrorMessage(`glsl_analyzer launch failed: ${err.message}`);
	}

	const diagnosticCollection = vscode.languages.createDiagnosticCollection('glsl');
	context.subscriptions.push(diagnosticCollection);

	// Validate all open GLSL files at startup
	vscode.workspace.textDocuments.forEach((doc) => {
		if (doc.languageId === 'glsl') {
			validateGLSLDocument(doc, context.extensionPath, diagnosticCollection);
		}
	});

	// Validate on new file open
	// new file open means the file must not be already cached in memory, so like from a new workspace
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((doc) => {
			if (doc.languageId === 'glsl') {
				validateGLSLDocument(doc, context.extensionPath, diagnosticCollection);
			}
		})
	);

	// Validate on current file save
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument((doc) => {
			if (doc.languageId === 'glsl') {
				validateGLSLDocument(doc, context.extensionPath, diagnosticCollection);
			}
		})
	);

	// Validate on current file changed
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			const doc = e.document;
			if (doc.languageId !== 'glsl') return;

			// debounce per‐document
			const key = doc.uri.toString();
			if (validateTimeouts.has(key)) {
				clearTimeout(validateTimeouts.get(key)!);
			}
			validateTimeouts.set(key, setTimeout(() => {
				validateGLSLDocumentViaStdin(doc, context.extensionPath, diagnosticCollection);
				validateTimeouts.delete(key);
			}, DEBOUNCE_DELAY));
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
