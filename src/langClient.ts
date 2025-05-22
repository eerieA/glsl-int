import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

import { getBinaryPath } from './utils/utils';

let client: LanguageClient | undefined;

export function getClient(): LanguageClient | undefined {
    return client;
}

export function startLangClient(context: vscode.ExtensionContext): void {
    try {
        const gaRelativePath = getBinaryPath('glsl_analyzer');
        const binaryFullPath = path.join(context.extensionPath, gaRelativePath);
        console.log("Attempting to start GLSL analyzer from", binaryFullPath);

        const serverOptions: ServerOptions = {
            command: binaryFullPath,
            args: ['--stdio'],
            options: { cwd: context.extensionPath }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: 'file', language: 'glsl' }],
            outputChannel: vscode.window.createOutputChannel('GLSL Analyzer Output')
        };

        client = new LanguageClient(
            'glslAnalyzer',
            'GLSL Analyzer Server',
            serverOptions,
            clientOptions
        );

        context.subscriptions.push({ dispose: () => client?.stop() }); // ensure it stops when extension is deactivated
        client.start().then(
            () => console.log("GLSL Analyzer ready"),
            (err) => console.error("LSP failed to start:", err)
        );

    } catch (err: any) {
        console.error('Error launching glsl_analyzer:', err);
        vscode.window.showErrorMessage(`glsl_analyzer launch failed: ${err.message}`);
    }
}

export async function stopLangClient(): Promise<void> {
    if (client) {
        await client.stop();
        client = undefined;
    }
}