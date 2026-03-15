// Tests estructurales para ClassChatPanel.tsx
// Valida: authHeaders, token de autorización en fetch calls

const chatFs = require("fs");
const chatPath = require("path");

const chatContent = chatFs.readFileSync(
  chatPath.join(__dirname, "../frontend/src/components/ClassChatPanel.tsx"),
  "utf-8",
);

describe("ClassChatPanel — autenticación en fetch", () => {
  it("debe definir authHeaders helper", () => {
    expect(chatContent).toContain("function authHeaders()");
  });

  it("debe leer auth_token del localStorage", () => {
    expect(chatContent).toContain('localStorage.getItem("auth_token")');
  });

  it("debe enviar Authorization header con Bearer token", () => {
    expect(chatContent).toContain("Authorization");
    expect(chatContent).toContain("Bearer");
  });

  it("todos los fetch deben usar authHeaders()", () => {
    const fetchCalls = (chatContent.match(/fetch\(/g) || []).length;
    const authCalls = (chatContent.match(/authHeaders\(\)/g) || []).length;
    expect(authCalls).toBeGreaterThanOrEqual(fetchCalls);
  });

  it("fetch POST /chat debe incluir Content-Type y authHeaders", () => {
    expect(chatContent).toContain('"Content-Type": "application/json", ...authHeaders()');
  });
});

describe("ClassChatPanel — estructura del componente", () => {
  it("debe exportar componente por defecto", () => {
    expect(chatContent).toContain("export default function ClassChatPanel");
  });

  it("debe manejar mensajes con role user y assistant", () => {
    expect(chatContent).toContain('"user"');
    expect(chatContent).toContain('"assistant"');
  });

  it("debe tener manejo de streaming SSE", () => {
    expect(chatContent).toContain("getReader");
    expect(chatContent).toContain("TextDecoder");
  });

  it("debe renderizar MarkdownLatex para respuestas", () => {
    expect(chatContent).toContain("MarkdownLatex");
  });
});
