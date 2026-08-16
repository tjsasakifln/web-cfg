/**
 * Public URL alias for the isolated conversion intake.
 * The implementation stays in market-answer-intake.cjs; this filename
 * avoids the /piloto/ internal-lang ban on `market-*` tokens in HTML.
 */
module.exports = require("./market-answer-intake.cjs");
