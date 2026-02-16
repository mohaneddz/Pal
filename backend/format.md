input example :
{
  "model": "gemma-3-1b-it-q4_0.gguf",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.2,
  "max_tokens": 256,
  "stream": false
}

output example :
{
  "choices": [
    {
      "finish_reason": "stop",
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello there! How can I help you today? 😊\n"
      }
    }
  ],
  "created": 1767522490,
  "model": "gemma-3-1b-it-q4_0.gguf",
  "system_fingerprint": "b6004-bbfc8492",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 13,
    "prompt_tokens": 18,
    "total_tokens": 31
  },
  "id": "chatcmpl-vrs0ocyYelc2WgTo48eqRGQhOF3ydI7K",
  "timings": {
    "prompt_n": 14,
    "prompt_ms": 148.649,
    "prompt_per_token_ms": 10.617785714285715,
    "prompt_per_second": 94.1815955707741,
    "predicted_n": 13,
    "predicted_ms": 244.154,
    "predicted_per_token_ms": 18.781076923076924,
    "predicted_per_second": 53.245083021371755
  }
}