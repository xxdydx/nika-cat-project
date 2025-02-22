require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"]
});

const CAT_API_URL = "https://api.thecatapi.com/v1/images/search";
const BREEDS_API_URL = "https://api.thecatapi.com/v1/breeds";

app.post("/api/chat", async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders();

  const userMessage = req.body.message;
  const messages = [
    {
      role: "system",
      content:
        "You are a friendly cat chatbot that responds with cat images and fun commentary. Do not use numbering or bullet points in your messages to format. Do not send any links in your response unless the user requests for cat images."
    },
    { role: "user", content: userMessage }
  ];
  const functions = [
    {
      name: "getCatImage",
      description: "Fetches a cat image from the Cat API",
      parameters: {
        type: "object",
        properties: {
          breed: {
            type: "string",
            description: "Optional breed filter for the cat image"
          },
          count: {
            type: "number",
            description: "Number of cat images to return"
          }
        }
      }
    }
  ];

  try {
    const completionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      functions: functions,
      function_call: "auto"
    });
    const responseMessage = completionResponse.choices[0].message;

    if (responseMessage.function_call) {
      const { name, arguments: argsString } = responseMessage.function_call;
      if (name === "getCatImage") {
        let args;
        try {
          args = JSON.parse(argsString);
        } catch (error) {
          res.write(
            `data: ${JSON.stringify({
              error: "Invalid function call arguments"
            })}\n\n`
          );
          res.end();
          return;
        }
        const count = args.count || 1;
        const params = { limit: count };

        if (args.breed) {
          const breedsApiResponse = await axios.get(BREEDS_API_URL);
          const breeds = breedsApiResponse.data;
          const breed = breeds.find(
            (b) =>
              b.name.toLowerCase() === args.breed.toLowerCase() ||
              b.id === args.breed
          );
          if (breed) {
            params.breed_id = breed.id;
          }
        }
        const catApiResponse = await axios.get(CAT_API_URL, { params });
        const catImageUrls = catApiResponse.data
          .map((cat) => cat.url)
          .slice(0, count);
        const functionResponseMessage = {
          role: "function",
          name: "getCatImage",
          content: JSON.stringify({ imageUrl: catImageUrls })
        };
        messages.push(responseMessage);
        messages.push(functionResponseMessage);
      }
    }

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      stream: true
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0].delta;
      const textChunk = delta?.content || "";
      if (textChunk) {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    }
    res.write("event: end\ndata: {}\n\n");
    res.end();
  } catch (error) {
    console.error("Streaming error:", error);
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: "Internal server error"
      })}\n\n`
    );
    res.end();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
