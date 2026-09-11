/**
 * Adversarial local classifier: treats UNKNOWN answers as GAP/defect.
 */
module.exports = {
  classifyUnknownAsDefect(answers) {
    return {
      status: "GAP",
      answers,
      domains: [{ id: "all", status: "GAP", reason: "unknown_treated_as_defect" }],
    };
  },
};
