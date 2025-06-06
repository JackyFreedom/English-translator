// webview/ipc.js
class IpcClient {
  constructor(vscode) {
    this.vscode = vscode;
    this.handlers = {};
    this.responseCallbacks = new Map();
    this.messageId = 0;
    this.handlersInitialized = false;

    window.addEventListener('message', (event) => {
      const { id, type, payload } = event.data;
      if (type === 'response') {
        const resolve = this.responseCallbacks.get(id);
        if (resolve) {
          resolve(payload);
          this.responseCallbacks.delete(id);
        }
      }
    });
  }

  send(type, payload = {}) {
    return new Promise((resolve) => {
      const id = ++this.messageId;
      this.responseCallbacks.set(id, resolve);
      this.vscode.postMessage({
        id,
        type,
        payload
      });
    });
  }

  on(type, handler) {
    if (!this.handlers[type]) {
      this.handlers[type] = [];
    }
    this.handlers[type].push(handler);
  }

  handle(event) {
    const { id, type, payload } = event.data;
    if (this.handlers[type]) {
      for (const handler of this.handlers[type]) {
        handler(payload, (response) => {
          this.vscode.postMessage({
            id,
            type: 'response',
            payload: response
          });
        });
      }
    }
  }
}
class TranslationPlugin {
  constructor() {
    this.flashcards = [];
    this.reviewIndex = 0;
    this.dailyStats = {
      date: '',
      newCards: 0,
      reviewedCards: 0,
      remembered: 0,
      forgotten: 0
    };

    // 句型识别词典
    this.sentenceTypes = {
      "apple": "日常用语",
      "hello": "日常问候",
      "goodbye": "告别用语",
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

    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      if (this.handlersInitialized) return;
      this.handlersInitialized = true;
      this.vscode = acquireVsCodeApi();

      // 初始化 IPC 客户端
      this.ipc = new IpcClient(this.vscode);

      // 绑定消息监听
      this.setupMessageHandlers();

      // 初始化 DOM 元素
      this.translateBtn = document.getElementById("translateBtn");
      this.resultCard = document.getElementById("resultCard");
      this.showEn = document.getElementById("showEn");
      this.showZh = document.getElementById("showZh");
      this.showType = document.getElementById("showType");
      this.englishInput = document.getElementById("englishInput");

      // 复习相关元素
      this.startReviewBtn = document.getElementById("startReviewBtn");
      this.closeReviewModalBtn = document.getElementById("closeReviewModal");
      this.nextCardBtn = document.getElementById("nextCardBtn");
      this.forgetCardBtn = document.getElementById("forgetCardBtn");
      this.toggleAnswerBtn = document.getElementById("toggleAnswerBtn");
      this.speakCurrentBtn = document.getElementById("speakCurrentBtn");
      this.speakResultBtn = document.getElementById("speakResultBtn");

      // 新增：清空按钮
      this.clearAllBtn = document.getElementById("clearAllBtn");

      if (!this.translateBtn || !this.resultCard || !this.showEn ||
        !this.showZh || !this.showType || !this.englishInput ||
        !this.startReviewBtn || !this.closeReviewModalBtn ||
        !this.nextCardBtn || !this.forgetCardBtn || !this.toggleAnswerBtn) {
        console.error("部分 DOM 元素未找到，请检查 HTML 是否完整");
        return;
      }

      // 注册事件监听
      this.translateBtn.addEventListener("click", () => this.translateAndSave());
      window.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && document.activeElement === this.englishInput) {
          this.translateAndSave();
        } else if (e.key === "Escape") {
          this.closeReviewModal();
        }
      });

      this.startReviewBtn.addEventListener("click", () => this.openReviewModal());
      this.closeReviewModalBtn.addEventListener("click", () => this.closeReviewModal());
      this.nextCardBtn.addEventListener("click", () => this.nextCard(true));
      this.forgetCardBtn.addEventListener("click", () => this.nextCard(false));
      this.toggleAnswerBtn.addEventListener("click", () => this.toggleAnswer());
      this.speakCurrentBtn.addEventListener("click", () => {
        const text = document.getElementById("reviewFrontText").innerText;
        this.speakText(text);
      });
// 绑定 speakResultBtn 发音功能
      if (this.speakResultBtn) {
        this.speakResultBtn.addEventListener("click", () => {
          const text = this.showEn.innerText; // 翻译结果中的英文句子
          this.speakText(text);
        });
      }
      // 新增：绑定清空按钮点击事件
      if (this.clearAllBtn) {
        this.clearAllBtn.addEventListener("click", () => this.clearAllCards());
      }

      // 加载历史数据
      this.getHistory();
      this.loadStats();
    });
  }
  async clearAllCards() {

    try {
      // 调用 IPC 发送清空指令
      await this.ipc.send('allDelete');

      // 本地数据重置
      this.flashcards = [];
      this.dailyStats.reviewedCards = 0;
      this.dailyStats.remembered = 0;
      this.dailyStats.forgotten = 0;
      this.dailyStats.newCards = 0;

      // 保存统计数据
      this.saveStats();

      // 更新 UI
      this.renderFlashcards();
      this.updateStatsUI();

    } catch (err) {
      console.error('清空失败:', err);
    }
  }
  setupMessageHandlers() {
    // 接收翻译结果
    this.ipc.on('translationResult', (payload, respond) => {
      const { original, text } = payload;
      // console.log('翻译结果:', payload);
      const structure = this.classifySentence(original);
      this.addFlashcard(original, text, structure);
      respond(); // 回复确认
    });

    // 接收错误信息
    this.ipc.on('error', (payload, respond) => {
      this.translateBtn.classList.remove("loading");
      alert('翻译失败：' + payload.text);
      respond();
    });

    // 接收历史记录
    this.ipc.on('historyData', (payload, respond) => {
      this.flashcards = payload || [];
      this.renderFlashcards();
      respond();
    });

    // 接收统计信息
    this.ipc.on('statsLoaded', (payload, respond) => {
      this.dailyStats = payload || this.getDefaultStats();
      this.updateStatsUI();
      respond();
    });
  }

  getDefaultStats() {
    return {
      date: this.formatToday(),
      newCards: 0,
      reviewedCards: 0,
      remembered: 0,
      forgotten: 0
    };
  }

  formatToday() {
    return new Date().toISOString().split('T')[0];
  }

  async translateAndSave() {
    const input = this.englishInput?.value.trim();
    if (!input) return alert("请输入英文内容");

    // 显示加载动画
    this.translateBtn.classList.add("loading");
    this.resultCard.style.display = 'none';

    try {
      const result = await this.ipc.send('translate', { text: input });
      console.log('翻译结果:', result);
      const { original, text } = result;
      const structure = this.classifySentence(original);
      this.addFlashcard(original, text, structure);
    } catch (err) {
      console.error('翻译失败:', err);
      alert('翻译失败，请重试');
    } finally {
      this.translateBtn.classList.remove("loading");
    }
  }

  addFlashcard(en, zh, structure) {
    this.flashcards.push({ en, zh, structure });
    this.renderFlashcards();

    this.showEn.innerText = en;
    this.showZh.innerText = zh;
    this.showType.innerText = structure;

    this.resultCard.style.display = 'block';
    this.englishInput.value = '';

    this.saveToVSCode(en, zh, structure);

    this.dailyStats.newCards += 1;
    this.saveStats();
  }

  saveToVSCode(en, zh, structure) {
    this.ipc.send('saveSentence', { data: { en, zh, structure } });
  }

  getHistory() {
    this.ipc.send('getHistory').then(history => {
      this.flashcards = history || [];
      this.renderFlashcards();
    }).catch(err => {
      console.error('获取历史失败:', err);
    });
  }

  renderFlashcards() {
    const listDiv = document.getElementById('flashcardList');
    if (!listDiv) return;

    listDiv.innerHTML = '<h3>已保存卡片</h3>';

    if (!Array.isArray(this.flashcards)) this.flashcards = [];

    this.flashcards.forEach((card, index) => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'flashcard-item';
      cardDiv.innerHTML = `
        <p><strong>英文：</strong>${card.en}</p>
        <p><strong>中文：</strong>${card.zh}</p>
        <p class="flashcard-type"><strong>句型：</strong> ${card.structure}</p>
        <button class="speak-btn" data-text="${card.en}">🔊 发音</button>
        <button class="delete-btn" data-index="${index}">🗑️ 删除</button>
      `;
      listDiv.appendChild(cardDiv);
    });

    if (this.listDivClickListener) return; // 防止重复绑定

    this.listDivClickListener = (event) => {
      const target = event.target;
      if (target.classList.contains('speak-btn')) {
        this.speakText(target.dataset.text);
      } else if (target.classList.contains('delete-btn')) {
        const index = parseInt(target.dataset.index);
        this.deleteCard(index);
      }
    };

    listDiv.addEventListener('click', this.listDivClickListener);
  }

  deleteCard(index) {
    this.ipc.send('delete', { index }).then(() => {
      this.getHistory(); // 刷新列表
    });
  }

  loadStats() {
    this.ipc.send('getStats').then(stats => {
      this.dailyStats = stats || this.getDefaultStats();
      this.updateStatsUI();
    });
  }

  saveStats() {
    this.ipc.send('updateStats', this.dailyStats);
  }

  updateStatsUI() {
    const statDate = document.getElementById("statDate");
    const statNewCards = document.getElementById("statNewCards");
    const statReviewedCards = document.getElementById("statReviewedCards");
    const statRemembered = document.getElementById("statRemembered");
    const statForgotten = document.getElementById("statForgotten");
    const statAccuracy = document.getElementById("statAccuracy");

    if (!statDate || !statNewCards || !statReviewedCards ||
      !statRemembered || !statForgotten || !statAccuracy) {
      console.warn("统计面板部分元素未找到");
      return;
    }

    statDate.innerText = this.dailyStats.date;
    statNewCards.innerText = this.dailyStats.newCards;
    statReviewedCards.innerText = this.dailyStats.reviewedCards;
    statRemembered.innerText = this.dailyStats.remembered;
    statForgotten.innerText = this.dailyStats.forgotten;

    const accuracy = this.dailyStats.reviewedCards > 0
      ? ((this.dailyStats.remembered / this.dailyStats.reviewedCards) * 100).toFixed(1) + '%'
      : '--%';
    statAccuracy.innerText = accuracy;

    this.updateReviewStatsUI();
  }

  updateReviewStatsUI() {
    const rReviewed = document.getElementById("reviewStatReviewedCards");
    const rRemembered = document.getElementById("reviewStatRemembered");
    const rForgotten = document.getElementById("reviewStatForgotten");
    const rAccuracy = document.getElementById("reviewStatAccuracy");

    if (!rReviewed || !rRemembered || !rForgotten || !rAccuracy) return;

    rReviewed.innerText = this.dailyStats.reviewedCards;
    rRemembered.innerText = this.dailyStats.remembered;
    rForgotten.innerText = this.dailyStats.forgotten;

    const accuracy = this.dailyStats.reviewedCards > 0
      ? ((this.dailyStats.remembered / this.dailyStats.reviewedCards) * 100).toFixed(1) + '%'
      : '--%';
    rAccuracy.innerText = accuracy;
  }

  classifySentence(en) {
    const lower = en.toLowerCase();
    for (const key in this.sentenceTypes) {
      if (lower.includes(key.toLowerCase())) {
        return this.sentenceTypes[key];
      }
    }

    if (typeof TinyNLP !== 'undefined') {
      const nlp = new TinyNLP();
      const sentenceType = nlp.analyze(en).type;
      if (sentenceType) return sentenceType;
    }

    return "未知句型";
  }

  speakText(text) {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      speechSynthesis.speak(utterance);
    } else {
      alert("您的浏览器不支持语音合成");
    }
  }

  openReviewModal() {
    if (this.flashcards.length === 0) {
      alert("没有可复习的卡片");
      return;
    }

    this.reviewIndex = 0;

    const reviewFrontText = document.getElementById("reviewFrontText");
    const reviewBackText = document.getElementById("reviewBackText");
    const reviewCard = document.getElementById("reviewCard");

    if (!reviewFrontText || !reviewBackText || !reviewCard) return;

    reviewFrontText.innerText = this.flashcards[this.reviewIndex].en;
    reviewBackText.innerText = this.flashcards[this.reviewIndex].zh;
    reviewCard.classList.remove('flipped');

    document.getElementById("reviewModal").style.display = 'block';
    this.updateReviewStatsUI();
  }

  closeReviewModal() {
    const modal = document.getElementById("reviewModal");
    if (modal) modal.style.display = 'none';
  }

  toggleAnswer() {
    const card = document.getElementById("reviewCard");
    if (card) card.classList.toggle('flipped');

    // 同步句型信息
    const currentCard = this.flashcards[this.reviewIndex];
    const typeElement = document.getElementById("reviewType");
    if (typeElement && currentCard) {
      typeElement.innerText = "句型：" + (currentCard.structure || "未知句型");
    }
  }
  nextCard(didRemember) {
    if (!Array.isArray(this.flashcards) || this.flashcards.length === 0) return;

    // 更新索引
    this.reviewIndex = (this.reviewIndex + 1) % this.flashcards.length;

    const reviewFrontText = document.getElementById("reviewFrontText");
    const reviewBackText = document.getElementById("reviewBackText");

    if (!reviewFrontText || !reviewBackText) return;

    const currentCard = this.flashcards[this.reviewIndex];

    // 更新文本
    reviewFrontText.innerText = currentCard.en || '无英文内容';
    reviewBackText.innerText = currentCard.zh || '无中文翻译';

    // 切换回正面
    const card = document.getElementById("reviewCard");
    if (card && card.classList.contains('flipped')) {
      card.classList.remove('flipped');
    }

    // 更新句型显示
    const typeElement = document.getElementById("reviewType");
    if (typeElement) {
      typeElement.innerText = "句型：" + (currentCard.structure || "未知句型");
    }

    // 更新统计
    this.dailyStats.reviewedCards += 1;
    if (didRemember) {
      this.dailyStats.remembered += 1;
    } else {
      this.dailyStats.forgotten += 1;
    }

    this.saveStats();
    this.updateReviewStatsUI();
  }
}
new TranslationPlugin();