import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
let commandRegistered = false;
export function activate(context: vscode.ExtensionContext) {
  console.log('Extension is now active!');
  console.log('当前目录',context.extensionPath)
  console.log('当前目录 view ',path.join(context.extensionPath,'dist',  'src', 'webview'))
  if (!commandRegistered) {
  const disposable = vscode.commands.registerCommand('translator.showTranslationPanel', () => {
    const panel = vscode.window.createWebviewPanel(
      'translator',
      '语言学习助手',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'dist','src', 'webview'))
        ]
      }
    );

    // 获取本地文件路径并读取内容
    const indexPath = path.join(context.extensionPath, 'dist','src', 'webview', 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');

    // 构建 webview 资源路径
    const webviewFolderUri = vscode.Uri.joinPath(vscode.Uri.file(context.extensionPath),'dist', 'src', 'webview');
    const finalWebviewUri = panel.webview.asWebviewUri(webviewFolderUri);

    const finalWebviewUriPath =  finalWebviewUri.toString()
    // 替换占位符为真实路径  https://file%2B.vscode-resource.vscode-cdn.net/d%3A/myProject/vscodeExtension/testrequest/src/webview 
    html = html.replace(/\$\{vscodeUri\}/g,finalWebviewUriPath );

    // 设置 HTML 内容
    panel.webview.html = html;

    // 获取配置历史记录
    const config = vscode.workspace.getConfiguration('languageLearning');
    let history: Array<{ original: string; translation: string; structure: string }> = config.get('history') || [];

    // 处理 Webview 发送的消息
    panel.webview.onDidReceiveMessage(
      async (message) => {
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
            } catch (e: any) {
              panel.webview.postMessage({ command: 'error', text: e.message });
            }
            break;

          case 'saveSentence':
            const data:any = message.data;
            history.push(data);
            await config.update('history', history, true);
            panel.webview.postMessage({ command: 'saved', count: history.length });
            break;

          case 'getHistory':
            panel.webview.postMessage({ command: 'historyData', data: history });
            break;
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
    commandRegistered = true;
  }
}

/**
 * 使用 MyMemory 翻译 API 进行翻译
 */
async function translateText(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const encodedText = encodeURIComponent(text);
  const url = `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=${sourceLang}|${targetLang}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data:any = await response.json();

    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText;
    } else {
      throw new Error('翻译接口返回无效数据');
    }
  } catch (error: any) {
    console.error('翻译失败:', error.message);
    throw error;
  }
}

export function deactivate() {}