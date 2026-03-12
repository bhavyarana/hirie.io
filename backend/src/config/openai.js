const { Mistral } = require('@mistralai/mistralai');

if (!process.env.MISTRAL_API_KEY) {
  console.warn('[Config] Warning: MISTRAL_API_KEY is not set');
}

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

module.exports = mistral;
