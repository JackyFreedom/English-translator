// webview/libs/tiny-nlp.js

const TinyNLP = {
  subjects: ['i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that'],
  verbs: ['am', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'will', 'shall', 'like', 'run', 'ran', 'running', 'loves', 'loved', 'loving'],
  tenses: {
    present: ['am', 'is', 'are', 'do', 'does', 'like', 'runs', 'love'],
    past: ['was', 'were', 'did', 'liked', 'ran', 'loved'],
    future: ['will', 'shall', 'going to']
  },

  analyze(sentence) {
    const words = sentence.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

    let subject = null;
    let verb = null;
    let object = null;
    let tense = '未知';

    // 提取主语
    for (let word of words) {
      if (this.subjects.includes(word)) {
        subject = word;
        break;
      }
    }

    // 提取动词和时态
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const nextWord = words[i + 1];

      // 匹配复合动词（如 will be doing）
      if (word === 'will' && nextWord) {
        verb = word + ' ' + nextWord;
        tense = 'future';
        break;
      }

      // 匹配单个动词
      for (let key in this.tenses) {
        if (this.tenses[key].includes(word)) {
          verb = word;
          tense = key;
          break;
        }
      }

      if (verb) break;
    }

    // 提取宾语（主语和动词之后的词）
    if (subject && verb) {
      const subIndex = words.findIndex(w => w === subject);
      const verbIndex = words.findIndex(w => w === verb.split(' ')[0]);
      if (verbIndex > -1 && verbIndex < words.length - 1) {
        object = words.slice(verbIndex + 1).join(' ');
      }
    }

    return { subject, verb, object, tense };
  }
};

// 必须挂载到 window 上才能被 Webview 访问
window.TinyNLP = TinyNLP;