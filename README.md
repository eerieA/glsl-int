# glsl-in3 README

**glsl-in3** is an experimental Visual Studio Code extension for learning and prototyping.  
It aims to provide GLSL (OpenGL Shading Language) syntax highlighting and IntelliSense support, with a focus on integration with [three.js](https://threejs.org/).

This project is in active development and not yet ready for production use, and may never be.

## License

This extension is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

During development, this extension calls external command-line tools (official released binaries) licensed under GPLv3 or GPLv3-compatible, which are included in the ./bin/ folder for convenience. These binaries are not bundled or distributed with the published extension.

This extension also incorporates third-party open-licensed source code. For details, see [Third-Party Components](#third-party-components) section.

## Features

- Syntax highlighting.
- Auto-complete.
- Hovering tooltips.
- Formatting.
- Fatal error red squiggles.
- Recognizing [three.js built-in uniforms](https://threejs.org/docs/#api/en/renderers/webgl/WebGLProgram).
- Compatible with GLSL 3.00 for WebGL 2.0.
- (TBC.)

## Requirements

There are binary dependencies that need to be downloaded.

- **glslangValidator**  
    - Go to https://github.com/KhronosGroup/glslang/releases/tag/main-tot.
    - Download the zipped binary corresponding to your platform.
    - Unzip the binary, rename it as `glsl_analyzer-<arch>-<os>`, where 
        - \<arch\> is one of `aarch64` and `x86_64`;
        - \<os\> is one of `linux-musl`, `macos` and `windows`.
    - Put it under `.\bin\glsl_analyzer`.

- **glsl_analyzer**  
    - Go to https://github.com/nolanderc/glsl_analyzer/releases.
    - Download the zipped binary corresponding to your platform.
    - Unzip the binary, rename it as `glslangValidator-<os>`, where
        - \<os\> is one of `linux`, `osx` and `windows`.
    - Put it under `.\bin\glslangValidator`.

> Good news is these may be automated in future development.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Not compatible with GLSL 1.00 (#version 100). So if a shader file has older version keywords like `varying`, or deprecated functions like `texture2D`, or deprecated output varying variables like `gl_FragColor`, this extension will report errors. Here is a table with some example differences between the two versions.

| GLSL Version Directive | GLSL ES Version | Used With   | Key Features  |
|------------------------|-----------------|-------------|---------------|
| #version 100         | GLSL ES 1.00     | WebGL 1.0   | Uses `attribute`/`varying`, `texture2D()`, `gl_FragColor`, no `in`/`out`    |
| #version 300 es      | GLSL ES 3.00     | WebGL 2.0   | Uses `in`/`out`, `layout` qualifiers, `texture()` (replaces `texture2D()`), `gl_FragColor` removed, more modern syntax and features |


## Release Notes

TBD

### 1.0.0

Initial release of ...

---

## Extension guidelines

This extension follows the best practices for creating VSCode extensions.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Third-Party Components

This extension includes third-party software, both binaries and source code, which are subject to their own licenses.

### Binaries

- **glslangValidator** (BSD 3-Clause)  
  From [Khronos glslang](https://github.com/KhronosGroup/glslang).  
  Included in the `./bin/` folder.  
  License: `bin/LICENSES/glslangValidator.txt`

- **glsl_analyzer** (GPLv3)  
  From [glsl_analyzer](https://github.com/nolanderc/glsl_analyzer).  
  Included in the `./bin/` folder.  
  License: `bin/LICENSES/glsl_analyzer.txt`

### Source Code

- **glsl.json** (MIT)  
  From the [Shiki TextMate Grammars](https://github.com/shikijs/textmate-grammars-themes).  
  Used for GLSL syntax highlighting.  
  Copyright (c) 2021 Shiki contributors  
  License: [MIT](https://github.com/shikijs/textmate-grammars-themes/blob/main/LICENSE)