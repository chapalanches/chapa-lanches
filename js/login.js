const LOGIN_STORAGE_KEY = "chapa_admin_logado";

// ALTERE AQUI O USUÁRIO E SENHA
const ADMIN_USER = "chapa_admin";
const ADMIN_PASS = "lanches100%";

const loginForm = document.getElementById("loginForm");
const usuarioInput = document.getElementById("usuario");
const senhaInput = document.getElementById("senha");
const mensagemLogin = document.getElementById("mensagemLogin");
const toggleSenhaBtn = document.getElementById("toggleSenha");

function mostrarMensagem(texto, tipo = "erro") {
  mensagemLogin.textContent = texto;
  mensagemLogin.className = "mensagem-login " + tipo;
}

function salvarSessaoAdmin() {
  localStorage.setItem(LOGIN_STORAGE_KEY, "true");
}

function adminJaLogado() {
  return localStorage.getItem(LOGIN_STORAGE_KEY) === "true";
}

function redirecionarAdmin() {
  window.location.href = "admin.html";
}

if (adminJaLogado()) {
  redirecionarAdmin();
}

toggleSenhaBtn.addEventListener("click", function () {
  const tipoAtual = senhaInput.getAttribute("type");

  if (tipoAtual === "password") {
    senhaInput.setAttribute("type", "text");
    toggleSenhaBtn.textContent = "Ocultar";
  } else {
    senhaInput.setAttribute("type", "password");
    toggleSenhaBtn.textContent = "Mostrar";
  }
});

loginForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const usuario = usuarioInput.value.trim();
  const senha = senhaInput.value.trim();

  if (!usuario || !senha) {
    mostrarMensagem("Preencha usuário e senha.");
    return;
  }

  if (usuario === ADMIN_USER && senha === ADMIN_PASS) {
    mostrarMensagem("Login realizado com sucesso.", "sucesso");
    salvarSessaoAdmin();

    setTimeout(() => {
      redirecionarAdmin();
    }, 500);

    return;
  }

  mostrarMensagem("Usuário ou senha inválidos.");
});
