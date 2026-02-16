import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";

import App from "./App";
import "./styles/base.css";
import "./styles/app-shell.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <App />
);
