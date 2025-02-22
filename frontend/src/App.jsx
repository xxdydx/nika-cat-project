import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

function App() {
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreamingText("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:6523/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input })
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let accumulatedText = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        lines.forEach((line) => {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr) {
              try {
                const dataObj = JSON.parse(dataStr);
                if (dataObj.text !== undefined) {
                  accumulatedText += dataObj.text;
                  setStreamingText(accumulatedText);
                }
              } catch (e) {
                console.error(e);
              }
            }
          } else if (line.startsWith("event: end")) {
            done = true;
          }
        });
      }
      setStreamingText("");
      const botMsg = { role: "bot", content: accumulatedText };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error("Error sending message", error);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <div className="chat-container">
        <div className="messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          ))}
          {streamingText && (
            <div className="message bot">
              <ReactMarkdown>{streamingText}</ReactMarkdown>
            </div>
          )}
          {loading && (
            <div className="message bot">
              <p>Typing...</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-container">
          <input
            type="text"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
      <div></div>
    </div>
  );
}

export default App;
