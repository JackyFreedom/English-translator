// webview/main.js
const vscode = acquireVsCodeApi();

function submitSearch() {
  const input = document.getElementById('searchInput').value.trim();
  if (!input) {
    alert("请输入搜索内容");
    return;
  }

  vscode.postMessage({
    command: 'search',
    text: input
  });
}

window.addEventListener('message', event => {
  const message = event.data;

  if (message.command === 'results') {
    const resultsList = document.getElementById('results');
    resultsList.innerHTML = '';

    message.items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item.name;
      resultsList.appendChild(li);
    });
  }

  if (message.command === 'error') {
    document.getElementById('error').textContent = '错误: ' + message.text;
  }
});