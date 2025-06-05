// src/extension.js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

class IpcHandler {
  constructor(panel) {
    this.panel = panel;
    this.handlers = {};
    this.init();
  }

  init() {
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type && message.id) {
          if (this.handlers[message.type]) {
            try {
              const result = await this.handlers[message.type](message.payload);
              this.panel.webview.postMessage({
                id: message.id,
                type: 'response',
                payload: result
              });
            } catch (err) {
              this.panel.webview.postMessage({
                id: message.id,
                type: 'response',
                payload: {
                  error: true,
                  message: err.message
                }
              });
            }
          }
        }
      },
      undefined,
      [this.panel]
    );
  }

  handle(type, handler) {
    this.handlers[type] = handler;
  }
}

let commandRegistered = false;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  if (!commandRegistered) {
    const disposable = vscode.commands.registerCommand('translator.showTranslationPanel', () => {
      const panel = vscode.window.createWebviewPanel(
        'translator',
        '语言学习助手',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))
          ]
        }
      );

      // 获取本地文件路径并读取内容
      const indexPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
      let html = fs.readFileSync(indexPath, 'utf-8');

      // 构建 webview 资源路径
      const webviewFolderUri = vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'));
      const finalWebviewUri = panel.webview.asWebviewUri(webviewFolderUri);
      const finalWebviewUriPath = finalWebviewUri.toString();

      // 替换占位符为真实路径
      html = html.replace(/\$\{vscodeUri\}/g, finalWebviewUriPath);

      // 设置 HTML 内容
      panel.webview.html = html;

      // 处理 Webview 发送的消息
      // 初始化 IPC Handler
      const ipc = new IpcHandler(panel);

      ipc.handle('translate', async ({ text }) => {
        let data = await translateText(text, 'en', 'zh-CN');
        return data
      });

      ipc.handle('getHistory', async () => {
        const config = vscode.workspace.getConfiguration('languageLearning');
        const history = config.get('history');
        return Array.isArray(history) ? [...history] : [];
      });

      ipc.handle('saveSentence', async ({ data }) => {
        const config = vscode.workspace.getConfiguration('languageLearning');
        let history = config.get('history');
        if (!Array.isArray(history)) history = [];
        history.push(data);
        try {
          await config.update('history', history, true);
          return { success: true };

        } catch (e) {
          return { error: true, message: e.message };
        }
      });

      ipc.handle('delete', async ({ index }) => {
        const config = vscode.workspace.getConfiguration('languageLearning');
        let history = config.get('history');

        if (!Array.isArray(history)) {
          history = [];
        }

        if (index >= 0 && index < history.length) {
          history.splice(index, 1); // 删除指定索引项
        }

        try {
          await config.update('history', [...history], true);

          return { success: true };
        } catch (e) {
          return { error: true, message: e.message };
        }
      });

      ipc.handle('allDelete', async () => {
        const config = vscode.workspace.getConfiguration('languageLearning');
        await config.update('history', [], true);
        return { success: true };
      });

      ipc.handle('getStats', async () => {
        const stats = context.globalState.get('dailyStats') || {
          date: new Date().toISOString().split('T')[0],
          newCards: 0,
          reviewedCards: 0,
          remembered: 0,
          forgotten: 0
        };
        return stats;
      });

      ipc.handle('updateStats', async (stats) => {
        context.globalState.update('dailyStats', stats);
        return { success: true };
      });
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

  const url = `https://translate.appworlds.cn/?text=${encodedText}&from=${sourceLang}&to=${targetLang}`;
  console.log('url', url);
  // const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;
  // https://api.mymemory.translated.net/get?q=test&langpair=en|zh
  // https://?text=This%20is%20a%20test%20text&from=en&to=zh-CN  
  //https://translate.appworlds.cn/?text=test&from=en&to=zh-CN
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('responseStatus', data);
    if (data.code === 200 && data.data) {
      return { original: text, text: data.data }; //返回翻译的文本
    } else {
      throw new Error('翻译接口返回无效数据');
    }
  } catch (error) {
    vscode.window.showErrorMessage('翻译失败，请检查网络连接或稍后再试。');
    console.error('翻译失败:', error.message);
    throw error;
  }
}

function deactivate() { }

module.exports = {
  activate,
  deactivate
};