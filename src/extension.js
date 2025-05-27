"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let commandRegistered = false;
function activate(context) {
    console.log('Extension is now active!');
    if (!commandRegistered) {
        const disposable = vscode.commands.registerCommand('translator.showTranslationPanel', () => {
            const panel = vscode.window.createWebviewPanel('translator', '语言学习助手', vscode.ViewColumn.One, {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))
                ]
            });
            // 获取本地文件路径并读取内容
            const indexPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
            let html = fs.readFileSync(indexPath, 'utf-8');
            // 构建 webview 资源路径
            const webviewFolderUri = vscode.Uri.joinPath(vscode.Uri.file(context.extensionPath), 'src', 'webview');
            const finalWebviewUri = panel.webview.asWebviewUri(webviewFolderUri);
            const finalWebviewUriPath = finalWebviewUri.toString();
            // 替换占位符为真实路径  https://file%2B.vscode-resource.vscode-cdn.net/d%3A/myProject/vscodeExtension/testrequest/src/webview 
            html = html.replace(/\$\{vscodeUri\}/g, finalWebviewUriPath);
            // 设置 HTML 内容
            panel.webview.html = html;
            // 获取配置历史记录
            const config = vscode.workspace.getConfiguration('languageLearning');
            let history = config.get('history') || [];
            // 处理 Webview 发送的消息
            panel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'translate':
                        const input = message.text;
                        try {
                            const translation = await translateText(input, 'en', 'zh');
                            panel.webview.postMessage({
                                command: 'translationResult',
                                text: translation,
                                original: input
                            });
                        }
                        catch (e) {
                            panel.webview.postMessage({ command: 'error', text: e.message });
                        }
                        break;
                    case 'saveSentence':
                        const data = message.data;
                        history.push(data);
                        await config.update('history', history, true);
                        panel.webview.postMessage({ command: 'saved', count: history.length });
                        break;
                    case 'getHistory':
                        panel.webview.postMessage({ command: 'historyData', data: history });
                        break;
                }
            }, undefined, context.subscriptions);
        });
        context.subscriptions.push(disposable);
        commandRegistered = true;
    }
}
/**
 * 使用 MyMemory 翻译 API 进行翻译
 */
async function translateText(text, sourceLang, targetLang) {
    const encodedText = encodeURIComponent(text);
    const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            return data.responseData.translatedText;
        }
        else {
            throw new Error('翻译接口返回无效数据');
        }
    }
    catch (error) {
        console.error('翻译失败:', error.message);
        throw error;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map