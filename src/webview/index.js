// index.js - 增强版：支持 Loading 提示 + 防止重复点击

window.onload = () => {
  if (typeof TinyNLP === 'undefined') {
    console.error('❌ TinyNLP 未成功加载，请检查路径或是否挂载到 window');
  } else {
    console.log('✅ TinyNLP 成功加载');
  }
};

const vscode = acquireVsCodeApi(); // 获取 VS Code Webview API

let flashcards = [];
let reviewIndex = 0;
let showChinese = false;
let isTranslating = false; // 控制按钮状态

// 句型分类映射表
const sentenceTypes = {
  "apple": "日常用语",
  "hello": "日常用语",
  "goodbye": "日常用语",
  "I love you": "情感表达",
  "how are you": "日常问候",
  "thank you": "礼貌用语",
  "What is your name?": "问答句型",
  "Can I help you?": "服务用语",
  "It's raining outside.": "描述天气",
  "Where is the station?": "问路",
  "Please be quiet.": "请求/命令",
  "Let's go!": "建议",
  "I'm tired.": "情绪表达"
};

/**
 * 查询翻译并保存句子
 */
function translateAndSave() {
  const input = document.getElementById('englishInput');
  const enText = input.value.trim();
  const button = document.querySelector("button[onclick='translateAndSave()']");

  if (!enText) return;

  // 防止重复点击
  if (isTranslating) return;

  isTranslating = true;
  button.disabled = true;
  button.innerHTML = '⏳ 正在翻译...';

  // 向主进程发送翻译请求
  vscode.postMessage({
    command: 'translate',
    text: enText,
    original: enText
  });
}

/**
 * 显示翻译结果并保存卡片
 */
function handleTranslationResult(message) {
  const enText = message.original;
  const zhText = message.text;
  const structure = analyzeSentenceStructure(enText);

  // 构造卡片数据
  const card = {
    en: enText,
    zh: zhText,
    type: sentenceType(enText),
    structure: structure
  };

  // 添加到本地列表
  flashcards.push(card);

  // 更新页面显示
  document.getElementById('showEn').innerText = enText;
  document.getElementById('showZh').innerText = zhText;
  document.getElementById('showType').innerText = structure;
  document.getElementById('resultBox').style.display = 'block';

  // 清空输入框
  document.getElementById('englishInput').value = '';

  // 向主进程发送保存请求
  vscode.postMessage({
    command: 'saveSentence',
    data: card
  });

  // 恢复按钮状态
  isTranslating = false;
  const button = document.querySelector("button[onclick='translateAndSave()']");
  button.disabled = false;
  button.innerHTML = '翻译并保存';

  // 更新卡片列表
  renderFlashcards();
}

/**
 * 句型结构分析
 */
function analyzeSentenceStructure(sentence) {
  if (typeof TinyNLP === 'undefined') {
    return '⚠️ 本地 NLP 模块未加载';
  }

  try {
    const result = TinyNLP.analyze(sentence);
    return [
      result.subject ? `主语: ${result.subject}` : '',
      result.verb ? `动词: ${result.verb}` : '',
      result.object ? `宾语: ${result.object}` : '',
      result.tense ? `时态: ${result.tense}` : ''
    ].filter(Boolean).join('\n') || '无法识别句型结构';
  } catch (e) {
    return '语法分析出错: ' + e.message;
  }
}

/**
 * 根据英文句子判断句型
 */
function sentenceType(text) {
  const key = text.toLowerCase();
  return sentenceTypes[key] || '其他';
}

/**
 * 英文发音朗读
 */
function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  speechSynthesis.speak(utterance);
}

/**
 * 当前卡片发音
 */
function speakCurrent() {
  if (flashcards.length === 0) return;
  const current = flashcards[reviewIndex];
  speakText(current.en); // 仅朗读英文
}

/**
 * 开始复习模式
 */
function startReview() {
  if (flashcards.length === 0) {
    alert("没有可复习的卡片");
    return;
  }
  reviewIndex = 0;
  showChinese = false;
  document.getElementById('reviewCard').style.display = 'block';
  document.getElementById('reviewContent').innerText = flashcards[reviewIndex].en;
  document.getElementById('reviewType').innerText = `句型：${flashcards[reviewIndex].structure}`;
}

/**
 * 显示/隐藏答案
 */
function toggleAnswer() {
  if (showChinese) {
    document.getElementById('reviewContent').innerText = flashcards[reviewIndex].en;
  } else {
    document.getElementById('reviewContent').innerText = flashcards[reviewIndex].zh;
  }
  showChinese = !showChinese;
}

/**
 * 下一题
 */
function nextCard() {
  reviewIndex = (reviewIndex + 1) % flashcards.length;
  showChinese = false;
  document.getElementById('reviewContent').innerText = flashcards[reviewIndex].en;
  document.getElementById('reviewType').innerText = `句型：${flashcards[reviewIndex].structure}`;
}

/**
 * 渲染卡片列表
 */
function renderFlashcards() {
  const listDiv = document.getElementById('flashcardList');
  listDiv.innerHTML = '<h2>已保存卡片</h2>';

  flashcards.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'flashcard';
    cardDiv.innerHTML = `
      <p><strong>英文：</strong><span class="card-en">${card.en}</span></p>
      <p><strong>中文：</strong>${card.zh}</p>
      <p class="flashcard-type"><strong>句型：</strong>\n${card.structure}</p>
      <button class="speak-btn" onclick="speakText('${card.en}')">🔊 发音</button>
    `;
    listDiv.appendChild(cardDiv);
  });
}

/**
 * 接收主进程消息
 */
window.addEventListener('message', event => {
  const message = event.data;

  if (message.command === 'translationResult') {
    handleTranslationResult(message);
  }

  if (message.command === 'error') {
    alert('翻译失败: ' + message.text);
    isTranslating = false;
    const button = document.querySelector("button[onclick='translateAndSave()']");
    button.disabled = false;
    button.innerHTML = '翻译并保存';
  }

  if (message.command === 'historyData') {
    flashcards = message.data;
    renderFlashcards();
  }
});

/**
 * 请求历史记录
 */
function getHistory() {
  vscode.postMessage({ command: 'getHistory' });
}