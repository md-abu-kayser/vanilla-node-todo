// server.js
const http = require("http");
const path = require("path");
const fs = require("fs").promises;

const filePath = path.join(__dirname, "./db/todo.json");

const readTodos = async () => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return parsed;
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
};

const writeTodos = async (todos) => {
  await fs.writeFile(filePath, JSON.stringify(todos, null, 2), "utf8");
};

const makeId = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

const sendJSON = (res, status = 200, payload = {}) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // GET all todos
    if (pathname === "/todos" && req.method === "GET") {
      const todos = await readTodos();
      return sendJSON(res, 200, todos);
    }

    // GET single todo by title OR id (prefers id if provided)
    if (pathname === "/todo" && req.method === "GET") {
      const id = url.searchParams.get("id");
      const title = url.searchParams.get("title");
      const todos = await readTodos();
      const todo = id
        ? todos.find((t) => t.id === id)
        : todos.find((t) => t.title === title);
      if (!todo) return sendJSON(res, 404, { error: "Todo not found" });
      return sendJSON(res, 200, todo);
    }

    // POST create a todo
    if (pathname === "/todos/create-todo" && req.method === "POST") {
      const body = await parseBody(req);
      const { title, body: todoBody } = body;
      if (!title || (!todoBody && todoBody !== "")) {
        return sendJSON(res, 400, { error: "title and body are required" });
      }

      const todos = await readTodos();
      // Prevent duplicate title (optional)
      if (todos.find((t) => t.title === title)) {
        return sendJSON(res, 409, {
          error: "Todo with this title already exists",
        });
      }

      const newTodo = {
        id: makeId(),
        title,
        body: todoBody,
        createdAt: new Date().toLocaleString(),
      };
      todos.push(newTodo);
      await writeTodos(todos);
      return sendJSON(res, 201, newTodo);
    }

    // PATCH update a todo by id or title
    if (pathname === "/todos/update-todo" && req.method === "PATCH") {
      const id = url.searchParams.get("id");
      const titleParam = url.searchParams.get("title");
      const payload = await parseBody(req);
      const { body: newBody } = payload;
      if (newBody === undefined) {
        return sendJSON(res, 400, { error: "body is required in payload" });
      }

      const todos = await readTodos();
      const idx = id
        ? todos.findIndex((t) => t.id === id)
        : todos.findIndex((t) => t.title === titleParam);

      if (idx === -1) return sendJSON(res, 404, { error: "Todo not found" });

      todos[idx].body = newBody;
      await writeTodos(todos);
      return sendJSON(res, 200, todos[idx]);
    }

    // DELETE todo by id or title
    if (pathname === "/todos/delete-todo" && req.method === "DELETE") {
      const id = url.searchParams.get("id");
      const titleParam = url.searchParams.get("title");
      if (!id && !titleParam) {
        return sendJSON(res, 400, {
          error: "id or title query param required",
        });
      }

      const todos = await readTodos();
      const filtered = todos.filter((t) =>
        id ? t.id !== id : t.title !== titleParam
      );

      if (filtered.length === todos.length) {
        return sendJSON(res, 404, { error: "Todo not found" });
      }

      await writeTodos(filtered);
      return sendJSON(res, 200, { success: true });
    }

    // fallback
    sendJSON(res, 404, { error: "Route Not Found" });
  } catch (err) {
    if (err.message === "Invalid JSON") {
      return sendJSON(res, 400, { error: "Invalid JSON payload" });
    }
    console.error(err);
    sendJSON(res, 500, { error: "Internal Server Error" });
  }
});

server.listen(5000, "127.0.0.1", () => {
  console.log("✅ Server listening on http://127.0.0.1:5000");
});
