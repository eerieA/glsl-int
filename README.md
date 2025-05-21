# glsl-in3 README

**glsl-in3** is an experimental Visual Studio Code extension for learning and prototyping.  
It aims to provide GLSL (OpenGL Shading Language) syntax highlighting and IntelliSense support, with a focus on integration with [three.js](https://threejs.org/).

This project is in active development and not yet ready for production use, and may never be.

## License

This extension is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html).

During development, this extension calls external command-line tools (official released binaries) licensed under GPLv3 or GPLv3-compatible, which are included in the ./bin/ folder for convenience. These binaries are not bundled or distributed with the published extension.

## Third-Party Binaries

This extension uses the following third-party tools:

- **glslangValidator** (BSD 3-Clause) — from [Khronos glslang](https://github.com/KhronosGroup/glslang)
- **glsl_analyzer** (GPLv3) — from [glsl_analyzer](https://github.com/nolanderc/glsl_analyzer)

Each binary's corresponding license can be found in the `bin/LICENSES/` folder.

By using this extension, you acknowledge and accept the GPLv3 license terms for these components.

## Features

TBD

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)
