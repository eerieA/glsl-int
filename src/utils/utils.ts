import * as path from 'path';

export function getBinaryPath(tool: 'glsl_analyzer' | 'glslangValidator'): string {
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