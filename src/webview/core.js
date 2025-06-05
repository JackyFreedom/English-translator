class TranslationPlugin {
  constructor() {
    this.flashcards = [];
    this.reviewIndex = 0;
    this.showChinese = false;
    this.isTranslating = false;

    this.sentenceTypes = {
      "apple": "日常用语",
      "hello": "日常用语",
      "goodbye": "日常问候",
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
      window.onload = () => {
        if (typeof TinyNLP === 'undefined') {
          console.error('❌ TinyNLP 未成功加载，请检查路径或是否挂载到 window');
        } else {
          console.log('✅ TinyNLP 成功加载');
        }
      };

      this.vscode = acquireVsCodeApi();

      // 初始化按钮事件绑定
      document.getElementById("translateBtn")?.addEventListener("click", () => this.translateAndSave());
      document.getElementById("reviewBtn")?.addEventListener("click", () => this.startReview());

      const reviewCard = document.getElementById("reviewCard");
      if (reviewCard) {
        reviewCard.addEventListener("click", (event) => {
          const target = event.target;

          if (target.id === "toggleAnswerBtn") {
            this.toggleAnswer();
          } else if (target.id === "nextCardBtn") {
            this.nextCard();
          } else if (target.id === "speakCurrentBtn") {
            this.speakCurrent();
          } else if (target.classList.contains("delete-current-card-btn")) {
            this.deleteCurrentCard(); // 通知主进程删除当前卡片
          }
        });
      }

      window.addEventListener('message', (event) => this.handleMessage(event));

      this.getHistory();
    });
  }

  deleteCurrentCard() {
    this.vscode.postMessage({
      command: 'showConfirmDelete'
    });
  }

  startReview() {
    if (this.flashcards.length === 0) {
      alert("没有可复习的卡片");
      return;
    }

    this.reviewIndex = 0;
    this.showChinese = false;

    const reviewCard = document.getElementById('reviewCard');
    const content = document.getElementById('reviewContent');
    const type = document.getElementById('reviewType');

    reviewCard.style.display = 'block';
    content.innerText = this.flashcards[this.reviewIndex].en;
    type.innerText = `句型：${this.flashcards[this.reviewIndex].structure}`;

    let deleteBtn = reviewCard.querySelector('.delete-current-card-btn');
    if (!deleteBtn) {
      deleteBtn = document.createElement('button');
      deleteBtn.textContent = '🗑️ 删除当前卡片';
      deleteBtn.className = 'delete-current-card-btn';
      reviewCard.appendChild(deleteBtn);
    }
  }

  toggleAnswer() {
    const content = document.getElementById('reviewContent');
    content.innerText = this.showChinese
      ? this.flashcards[this.reviewIndex].en
      : this.flashcards[this.reviewIndex].zh;
    this.showChinese = !this.showChinese;
  }

  nextCard() {
    this.reviewIndex = (this.reviewIndex + 1) % this.flashcards.length;
    this.showChinese = false;

    const content = document.getElementById('reviewContent');
    const type = document.getElementById('reviewType');

    content.innerText = this.flashcards[this.reviewIndex].en;
    type.innerText = `句型：${this.flashcards[this.reviewIndex].structure}`;
  }

  deleteCard(index) {
    this.vscode.postMessage({
      command: 'delete',
      index: index
    });
  }

  renderFlashcards() {
    const listDiv = document.getElementById('flashcardList');
    listDiv.innerHTML = '<h2>已保存卡片</h2>';

    if (!Array.isArray(this.flashcards)) {
      console.error('flashcards 不是数组:', this.flashcards);
      this.flashcards = [];
    }

    this.flashcards.forEach((card, index) => {
      const cardDiv = document.createElement('div');
      cardDiv.className = 'flashcard';
      cardDiv.innerHTML = `
        <p><strong>英文：</strong><span class="card-en">${card.en}</span></p>
        <p><strong>中文：</strong>${card.zh}</p>
        <p class="flashcard-type"><strong>句型：</strong>\n${card.structure}</p>
        <button class="speak-btn" data-text="${card.en}">🔊 发音</button>
        <button class="delete-btn" data-index="${index}">🗑️ 删除</button>
      `;
      listDiv.appendChild(cardDiv);
    });

    listDiv.addEventListener('click', (event) => {
      const target = event.target;

      if (target.classList.contains('speak-btn')) {
        this.speakText(target.dataset.text);
      } else if (target.classList.contains('delete-btn')) {
        this.deleteCard(parseInt(target.dataset.index));
      }
    });
  }

  handleMessage(event) {
    const message = event.data;

    if (message.command === 'deleted') {
      if (Array.isArray(message.data)) {
        console.log('接收到新 flashcards:', message.data); // 调试信息
        this.flashcards = [...message.data];
        this.renderFlashcards();

        if (this.flashcards.length === 0) {
          document.getElementById('reviewCard').style.display = 'none';
        } else if (this.reviewIndex >= this.flashcards.length) {
          this.reviewIndex = this.flashcards.length - 1;
        }
      } else {
        console.error('Expected array but got:', message.data);
        this.flashcards = [];
        this.renderFlashcards();
      }
    }

    if (message.command === 'translationResult') {
      this.handleTranslationResult(message);
    }

    if (message.command === 'error') {
      alert('操作失败: ' + message.text);
    }

    if (message.command === 'historyData') {
      if (Array.isArray(message.data)) {
        this.flashcards = [...message.data];
        this.renderFlashcards();
      } else {
        this.flashcards = [];
        this.renderFlashcards();
      }
    }
  }

  getHistory() {
    this.vscode.postMessage({ command: 'getHistory' });
  }
}


const plugin = new TranslationPlugin();