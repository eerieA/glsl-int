import * as vscode from 'vscode';

export class DebounceManager implements vscode.Disposable {
    private readonly timeouts = new Map<string, NodeJS.Timeout>();

    constructor(
        private delay = 500
    ) { }

    debounce(key: string, callback: () => void) {
        if (this.timeouts.has(key)) {
            clearTimeout(this.timeouts.get(key)!);
        }
        this.timeouts.set(
            key,
            setTimeout(() => {
                callback();
                this.timeouts.delete(key);
            }, this.delay)
        );
    }

    dispose() {
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();
    }
}
