(function (root) {
  "use strict";

  function isCorrect(question, response) {
    if (question.type === "判断题") {
      return typeof question.answer === "boolean" && response === question.answer;
    }
    if (question.type === "单选题") {
      return typeof question.answer === "string" && response === question.answer;
    }
    if (question.type !== "多选题" || !Array.isArray(response) || !Array.isArray(question.answer)) {
      return false;
    }
    const selected = new Set(response);
    return selected.size === response.length && selected.size === question.answer.length &&
      question.answer.every(option => selected.has(option));
  }

  if (typeof module === "object" && module.exports) module.exports = { isCorrect };
  else root.Grading = { isCorrect };
})(globalThis);
