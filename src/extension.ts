import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';

function getBinaryName(): string {
	const platform = process.platform;     // 'darwin', 'win32', 'linux'
	const arch = process.arch;             // 'x64', 'arm64'
	console.log(`Detected platform: ${platform}, architecture: ${arch}`);

	const archMap: Record<string, string> = {
		'x64': 'x86_64',
		'arm64': 'aarch64'
	};

	const platMap: Record<string, string> = {
		'win32': 'windows',
		'darwin': 'macos',
		'linux': 'linux-musl'
	};

	const prefix = archMap[arch];
	const suffix = platMap[platform];

	if (!prefix || !suffix) {
		throw new Error(`Unsupported platform or architecture: ${platform} ${arch}`);
	}

	return path.join(prefix + '-' + suffix, `glsl_analyzer${platform === 'win32' ? '.exe' : ''}`);
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

	try {
		const binaryRelativePath = getBinaryName();
		console.log("Relative path:", binaryRelativePath);
		const binaryFullPath = path.join(context.extensionPath, 'bin', binaryRelativePath);
		console.log("Attempting to start GLSL analyzer at", binaryFullPath);

		// Try spawning the binary for the current platform
		const child = cp.spawn(binaryFullPath, ['--help'], {
			stdio: 'pipe'
		});

		child.stdout?.on('data', (data) => {
			console.log(`glsl_analyzer stdout: ${data}`);
		});

		child.stderr?.on('data', (data) => {
			console.error(`glsl_analyzer stderr: ${data}`);
		});

		child.on('error', (err) => {
			console.error('Failed to start glsl_analyzer:', err);
			vscode.window.showErrorMessage(`glsl_analyzer failed to start: ${err.message}`);
		});

		child.on('exit', (code, signal) => {
			console.log(`glsl_analyzer exited with code ${code} and signal ${signal}`);
		});
	} catch (err: any) {
		console.error('Error launching glsl_analyzer:', err);
		vscode.window.showErrorMessage(`glsl_analyzer launch failed: ${err.message}`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
