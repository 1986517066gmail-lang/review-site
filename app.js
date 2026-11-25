(() => {
  "use strict";

  const courses = { dance: "舞蹈", ai: "人工智能与创业智慧" };
  const modes = { browse: "题库浏览", ordered: "顺序练习", random: "随机练习", wrong: "错题本", favorite: "收藏" };
  const storageKey = "review-site.records.v1";
  const byId = id => document.getElementById(id);
  const content = byId("content");
  const notice = byId("notice");
  const keyword = byId("keyword");
  const moduleFilter = byId("module");
  const typeFilter = byId("type");
  const filters = document.querySelector(".filters");
  const courseButtons = document.querySelectorAll("[data-course]");
  const modeButtons = document.querySelectorAll("[data-mode]");
  const importFile = byId("import-file");
  const bank = {};
  const questionIds = {};

  let course = "dance";
  let mode = "browse";
  let records = emptyRecords();
  let practice = null;

  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function button(label, className, action) {
    const control = element("button", className, label);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  }

  function message(label, error = false) {
    notice.textContent = label;
    notice.className = error ? "notice error" : "notice";
    notice.hidden = !label;
  }

  function emptyRecords() {
    return { version: 1, courses: { dance: { attempts: {}, favorites: [] }, ai: { attempts: {}, favorites: [] } } };
  }

  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function decodeRecords(raw) {
    const saved = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!object(saved) || saved.version !== 1 || !object(saved.courses) ||
        Object.keys(saved.courses).length !== Object.keys(courses).length) {
      throw new Error("备份版本或课程结构不符");
    }

    const clean = emptyRecords();
    for (const id of Object.keys(courses)) {
      const data = saved.courses[id];
      if (!object(data) || !object(data.attempts) || !Array.isArray(data.favorites)) {
        throw new Error(courses[id] + "的记录结构不符");
      }
      for (const [qid, correct] of Object.entries(data.attempts)) {
        if (!questionIds[id].has(qid) || typeof correct !== "boolean") {
          throw new Error(courses[id] + "含无效的答题记录");
        }
        clean.courses[id].attempts[qid] = correct;
      }
      const favorites = new Set(data.favorites);
      if (favorites.size !== data.favorites.length || [...favorites].some(qid => !questionIds[id].has(qid))) {
        throw new Error(courses[id] + "含无效的收藏记录");
      }
      clean.courses[id].favorites = [...favorites];
    }
    return clean;
  }

  function loadRecords() {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? emptyRecords() : decodeRecords(raw);
  }

  function storeRecords(next) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    records = next;
  }

  function updateRecords(change) {
    try {
      const next = loadRecords();
      change(next.courses[course]);
      storeRecords(next);
      updateStats();
      message("");
      return true;
    } catch {
      message("保存学习记录失败。请检查浏览器是否允许访问本地存储。", true);
      return false;
    }
  }

  function updateStats() {
    const { attempts, favorites } = records.courses[course];
    byId("total").textContent = bank[course].length;
    byId("attempted").textContent = Object.keys(attempts).length;
    byId("wrong-count").textContent = Object.values(attempts).filter(correct => !correct).length;
    byId("favorite-count").textContent = favorites.length;
  }

  function resetFilters() {
    keyword.value = "";
    typeFilter.value = "";
    moduleFilter.replaceChildren(new Option("全部模块", ""));
    for (const name of new Set(bank[course].map(question => question.module))) {
      moduleFilter.add(new Option(name, name));
    }
  }

  function optionsFor(question) {
    if (question.type !== "判断题") return question.options;
    if (question.options.length) {
      return question.options.map(option => ({ ...option, value: option.text === "对" }));
    }
    return [{ id: "", text: "对", value: true }, { id: "", text: "错", value: false }];
  }

  function showAnswer(question, correct) {
    const body = element("div", "details-content");
    const answer = typeof question.answer === "boolean"
      ? (question.answer ? "对" : "错")
      : [].concat(question.answer).map(id => {
        const option = question.options.find(item => item.id === id);
        return option ? id + " " + option.text : id;
      }).join("、");

    if (correct !== undefined) body.setAttribute("role", "status");
    const result = correct === undefined ? "" : (correct ? "答对了。\n" : "答错了。\n");
    body.append(element("p", correct === undefined ? "answer" : "answer " + (correct ? "good" : "bad"),
      result + "答案：" + answer));
    body.append(element("p", "meta", question.answerRaw));
    for (const note of question.notes) body.append(element("p", "review-note", note));
    return body;
  }

  function favoriteButton(question) {
    const control = button("", "favorite", () => {
      const saved = updateRecords(data => {
        const index = data.favorites.indexOf(question.id);
        if (index === -1) data.favorites.push(question.id);
        else data.favorites.splice(index, 1);
      });
      if (!saved) return;
      if (mode === "favorite") {
        renderList();
        byId("mode-title").focus();
      } else {
        refresh();
      }
    });
    function refresh() {
      const favorite = records.courses[course].favorites.includes(question.id);
      control.textContent = favorite ? "取消收藏" : "收藏";
      control.setAttribute("aria-pressed", String(favorite));
    }
    refresh();
    return control;
  }

  function questionCard(question) {
    const card = element("article", "card");
    const top = element("div", "card-top");
    const tags = element("div", "tags");
    tags.append(element("span", "tag", "第 " + question.originalNumber + " 题"), element("span", "tag", question.type));
    for (const status of question.reviewStatus) {
      if (status !== "原记录") {
        const warning = status === "待核对" || status === "题干不完整";
        tags.append(element("span", warning ? "tag warning" : "tag", status));
      }
    }
    top.append(tags, favoriteButton(question));
    card.append(top, element("p", "meta", question.module), element("h3", "stem", question.stem));
    return card;
  }

  function optionContent(control, option, index, interactive) {
    const key = option.id || (interactive ? String(index + 1) : "");
    if (key) control.append(element("span", "option-key", key));
    control.append(element("span", "", option.text));
  }

  function visibleQuestions() {
    const search = keyword.value.trim().toLocaleLowerCase();
    const { attempts, favorites } = records.courses[course];
    return bank[course].filter(question => {
      if (mode === "wrong" && attempts[question.id] !== false) return false;
      if (mode === "favorite" && !favorites.includes(question.id)) return false;
      if (moduleFilter.value && question.module !== moduleFilter.value) return false;
      if (typeFilter.value && question.type !== typeFilter.value) return false;
      const searchable = [question.id, String(question.originalNumber), question.stem,
        ...optionsFor(question).map(option => option.text)];
      return !search || searchable.some(value => value.toLocaleLowerCase().includes(search));
    });
  }

  function renderList() {
    const questions = visibleQuestions();
    const list = document.createDocumentFragment();
    byId("result-count").textContent = questions.length + " 题";
    if (!questions.length) {
      const empty = { browse: "没有符合筛选条件的题目。", favorite: "当前筛选下没有收藏题目。", wrong: "当前筛选下没有错题。" };
      list.append(element("p", "empty", empty[mode]));
    } else if (mode === "wrong") {
      const actions = element("div", "actions");
      actions.append(button("重练当前错题", "primary", () => startPractice(questions)));
      list.append(actions);
    }
    for (const question of questions) {
      const card = questionCard(question);
      const options = element("ul", "options");
      optionsFor(question).forEach((option, index) => {
        const row = element("li", "read-option");
        optionContent(row, option, index, false);
        options.append(row);
      });
      const details = element("details");
      details.append(element("summary", "", "查看答案"), showAnswer(question));
      card.append(options, details);
      list.append(card);
    }
    content.replaceChildren(list);
  }

  function practiceQueue() {
    const queue = [...bank[course]];
    if (mode === "random") {
      for (let index = queue.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [queue[index], queue[other]] = [queue[other], queue[index]];
      }
    }
    return queue;
  }

  function startPractice(queue) {
    practice = { queue, index: 0 };
    render();
    byId("mode-title").focus();
  }

  function leaveWrongPractice() {
    practice = null;
    render();
    byId("mode-title").focus();
  }

  function renderPractice() {
    const { queue, index } = practice;
    const question = queue[index];
    if (!question) {
      byId("result-count").textContent = queue.length + " / " + queue.length + " 题";
      const actions = element("div", "actions");
      const restart = mode === "wrong" ? leaveWrongPractice : () => startPractice(practiceQueue());
      actions.append(button(mode === "wrong" ? "返回错题本" : "再练一轮", "primary", restart));
      content.replaceChildren(element("p", "empty", "本轮练习已完成。"), actions);
      return;
    }

    byId("result-count").textContent = (index + 1) + " / " + queue.length + " 题";
    const card = questionCard(question);
    const options = optionsFor(question);
    const optionList = element("ul", "options");
    const selected = new Set();
    const multiple = question.type === "多选题";
    let submitted = false;

    const controls = options.map((option, position) => {
      const row = element("li");
      const control = button("", "option", () => {
        if (submitted) return;
        if (!multiple) selected.clear();
        if (selected.has(position)) selected.delete(position);
        else selected.add(position);
        controls.forEach((item, i) => item.setAttribute("aria-pressed", String(selected.has(i))));
        submit.disabled = selected.size === 0;
      });
      control.setAttribute("aria-pressed", "false");
      optionContent(control, option, position, true);
      row.append(control);
      optionList.append(row);
      return control;
    });

    const submit = button("提交答案", "primary", () => {
      if (submitted || !selected.size) return;
      const choices = [...selected].map(position => options[position].value ?? options[position].id);
      const correct = window.Grading.isCorrect(question, multiple ? choices : choices[0]);
      if (!updateRecords(data => { data.attempts[question.id] = correct; })) return;

      submitted = true;
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
      controls.forEach((control, position) => {
        control.disabled = true;
        if (answers.includes(options[position].value ?? options[position].id)) control.classList.add("is-answer");
      });
      submit.disabled = true;
      next.disabled = false;
      card.append(showAnswer(question, correct));
      next.focus({ preventScroll: true });
    });
    const next = button(index === queue.length - 1 ? "完成本轮" : "下一题", "", () => {
      if (!submitted) return;
      practice.index += 1;
      render();
      byId("mode-title").focus();
    });
    submit.disabled = true;
    next.disabled = true;
    const actions = element("div", "actions");
    actions.append(submit, next);
    if (mode === "wrong") actions.append(button("返回错题本", "", leaveWrongPractice));
    card.append(optionList, actions);
    content.replaceChildren(card);
    practice.controls = { options, buttons: controls, submit, next };
  }

  function render() {
    byId("course-title").textContent = courses[course];
    byId("mode-title").textContent = mode === "wrong" && practice ? "错题重练" : modes[mode];
    for (const control of courseButtons) control.setAttribute("aria-pressed", String(control.dataset.course === course));
    for (const control of modeButtons) {
      if (control.dataset.mode === mode) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    }
    const answering = practice && practice.index < practice.queue.length;
    filters.hidden = Boolean(practice);
    byId("keys").hidden = !answering;
    updateStats();
    if (practice) {
      practice.controls = null;
      renderPractice();
    } else {
      renderList();
    }
  }

  function openMode(nextMode) {
    mode = nextMode;
    if (mode === "ordered" || mode === "random") startPractice(practiceQueue());
    else {
      practice = null;
      render();
      byId("mode-title").focus();
    }
  }

  function handleKey(event) {
    if (!practice?.controls || event.defaultPrevented || event.isComposing || event.repeat ||
        event.ctrlKey || event.altKey || event.metaKey || event.target.isContentEditable ||
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) return;

    const { options, buttons, submit, next } = practice.controls;
    let control;
    if (event.key === "ArrowRight") {
      control = next;
    } else if (event.key === "Enter") {
      const focused = event.target.closest("button, a, summary");
      if (focused && focused !== submit && !buttons.includes(focused)) return;
      control = submit;
    } else if (/^[1-9]$/.test(event.key)) {
      control = buttons[Number(event.key) - 1];
    } else if (/^[a-z]$/i.test(event.key)) {
      const position = options.findIndex(option => option.id === event.key.toUpperCase());
      control = buttons[position];
    }
    if (control && !control.disabled) {
      event.preventDefault();
      control.click();
    }
  }

  function exportRecords() {
    try {
      const href = URL.createObjectURL(new Blob([JSON.stringify(loadRecords(), null, 2)], { type: "application/json" }));
      const link = element("a");
      link.href = href;
      link.download = "review-site-records.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      message("导出失败。请检查浏览器本地存储是否可读。", true);
    }
  }

  async function importRecords() {
    const file = importFile.files[0];
    if (!file) return;
    importFile.disabled = true;
    importFile.value = "";
    try {
      const next = decodeRecords(await file.text());
      storeRecords(next);
    } catch {
      message("导入失败。备份文件内容无效、与题库不匹配，或浏览器无法保存记录。", true);
      return;
    } finally {
      importFile.disabled = false;
    }
    byId("import").focus();
    const restarting = mode === "ordered" || mode === "random";
    practice = restarting ? { queue: practiceQueue(), index: 0 } : null;
    render();
    message("已恢复两门课的学习记录。");
  }

  if (!Array.isArray(window.QUESTIONS) || typeof window.Grading?.isCorrect !== "function") {
    message("题库或判分脚本加载失败。请从完整的 site 目录打开 index.html。", true);
    return;
  }
  for (const id of Object.keys(courses)) {
    bank[id] = window.QUESTIONS.filter(question => question.courseId === id)
      .sort((left, right) => left.originalNumber - right.originalNumber);
    questionIds[id] = new Set(bank[id].map(question => question.id));
  }

  try {
    records = loadRecords();
  } catch {
    message("无法读取学习记录。请检查浏览器存储权限，或导入有效的 JSON 备份。", true);
  }
  for (const control of courseButtons) {
    control.addEventListener("click", () => {
      const nextCourse = control.dataset.course;
      if (nextCourse === course) return;
      course = nextCourse;
      resetFilters();
      openMode("browse");
    });
  }
  for (const control of modeButtons) {
    control.addEventListener("click", () => {
      if (control.dataset.mode !== mode) openMode(control.dataset.mode);
    });
  }
  keyword.addEventListener("input", renderList);
  moduleFilter.addEventListener("change", renderList);
  typeFilter.addEventListener("change", renderList);
  byId("export").addEventListener("click", exportRecords);
  byId("import").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importRecords);
  document.addEventListener("keydown", handleKey);
  resetFilters();
  render();
})();
