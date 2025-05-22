import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';

import { getBinaryPath } from './utils/utils';
import { DebounceManager } from './utils/debounceManager';
import { startLangClient, getClient, stopLangClient } from './langClient';

const DEBOUNCE_DELAY = 500; // ms
const VALIDATOR_KILL_TIMEOUT = 5000;

function validateGLSLDocument(document: vscode.TextDocument, extensionPath: string, diagnosticCollection: vscode.DiagnosticCollection, needTmp: boolean = false) {
	let filePath = document.fileName;
	const validatorPath = getBinaryPath('glslangValidator');
	const validatorFullPath = path.join(extensionPath, validatorPath);
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

	// Call helper function to start a language client talking with a glsl_analyzer server
	startLangClient(context);

	const diagnosticCollection = vscode.languages.createDiagnosticCollection('glsl');
	context.subscriptions.push(diagnosticCollection);
	const debounceManager = new DebounceManager(DEBOUNCE_DELAY);
	context.subscriptions.push(debounceManager);

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
