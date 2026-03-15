// =========================
// CHAPA LANCHES - APP.JS
// =========================

let carrinho = [];

// =========================
// CONFIG PADRÃO
// Usa config.js se existir
// =========================
const APP_CONFIG = typeof CONFIG !== "undefined" ? CONFIG : {
  telefone: "5511999999999",
  enderecoLoja: "Rua da Lanchonete, 123 - Centro",
  taxaMinima: 4,
  raioMinimoKm: 3,
  valorPorKm: 1,
  horarioAbertura: "18:00",
  horarioFechamento: "23:30"
};

// =========================
// ELEMENTOS
// =========================
const listaCarrinho = document.getElementById("lista-carrinho");
const subtotalEl = document.getElementById("subtotal");
const taxaEntregaEl = document.getElementById("taxa-entrega");
const totalEl = document.getElementById("total");
const statusLojaEl = document.getElementById("status-loja");

const nomeInput = document.getElementById("nome");
const enderecoInput = document.getElementById("endereco");
const numeroInput = document.getElementById("numero");
const bairroInput = document.getElementById("bairro");
const referenciaInput = document.getElementById("referencia");
const pagamentoInput = document.getElementById("pagamento");
const observacaoInput = document.getElementById("observacao");
const tipoEntregaInput = document.getElementById("tipo-entrega");
const distanciaInput = document.getElementById("distancia");

const btnWhatsApp = document.getElementById("btn-whatsapp");

// =========================
// INICIALIZAÇÃO
// =========================
document.addEventListener("DOMContentLoaded", () => {
  iniciarBotoesAdicionar();
  atualizarCarrinho();
  atualizarStatusLoja();
  configurarEventos();
});

// =========================
// BOTÕES DE ADICIONAR
// Espera elementos com:
// class="btn-add"
// data-nome="X-Burguer"
// data-preco="25.90"
// =========================
function iniciarBotoesAdicionar() {
  const botoes = document.querySelectorAll(".btn-add");

  botoes.forEach((botao) => {
    botao.addEventListener("click", () => {
      const nome = botao.dataset.nome;
      const preco = parseFloat(botao.dataset.preco || "0");

      if (!nome || isNaN(preco)) {
        alert("Produto inválido.");
        return;
      }

      adicionarAoCarrinho(nome, preco);
    });
  });
}

// =========================
// EVENTOS
// =========================
function configurarEventos() {
  if (tipoEntregaInput) {
    tipoEntregaInput.addEventListener("change", () => {
      atualizarVisibilidadeEntrega();
      atualizarCarrinho();
    });
  }

  if (distanciaInput) {
    distanciaInput.addEventListener("input", () => {
      atualizarCarrinho();
    });
  }

  if (btnWhatsApp) {
    btnWhatsApp.addEventListener("click", enviarPedidoWhatsApp);
  }

  atualizarVisibilidadeEntrega();
}

// =========================
// CARRINHO
// =========================
function adicionarAoCarrinho(nome, preco) {
  const itemExistente = carrinho.find((item) => item.nome === nome);

  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    carrinho.push({
      nome,
      preco,
      quantidade: 1
    });
  }

  atualizarCarrinho();
}

function removerDoCarrinho(nome) {
  const index = carrinho.findIndex((item) => item.nome === nome);

  if (index === -1) return;

  if (carrinho[index].quantidade > 1) {
    carrinho[index].quantidade -= 1;
  } else {
    carrinho.splice(index, 1);
  }

  atualizarCarrinho();
}

function atualizarCarrinho() {
  if (!listaCarrinho) return;

  listaCarrinho.innerHTML = "";

  if (carrinho.length === 0) {
    listaCarrinho.innerHTML = `<p style="color:#cfcfcf;">Seu carrinho está vazio.</p>`;
  } else {
    carrinho.forEach((item) => {
      const div = document.createElement("div");
      div.className = "item-carrinho";

      const totalItem = item.preco * item.quantidade;

      div.innerHTML = `
        <div>
          <strong>${item.quantidade}x ${item.nome}</strong><br>
          <small>R$ ${formatarMoeda(item.preco)} cada</small>
        </div>
        <div style="text-align:right;">
          <strong>R$ ${formatarMoeda(totalItem)}</strong><br>
          <button type="button" onclick="removerDoCarrinho('${escapeAspas(item.nome)}')" style="margin-top:6px;padding:6px 10px;background:#ff5a5a;color:#fff;border:none;border-radius:6px;cursor:pointer;">
            Remover
          </button>
        </div>
      `;

      listaCarrinho.appendChild(div);
    });
  }

  const subtotal = calcularSubtotal();
  const taxaEntrega = calcularTaxaEntrega();
  const total = subtotal + taxaEntrega;

  if (subtotalEl) subtotalEl.textContent = `R$ ${formatarMoeda(subtotal)}`;
  if (taxaEntregaEl) taxaEntregaEl.textContent = `R$ ${formatarMoeda(taxaEntrega)}`;
  if (totalEl) totalEl.textContent = `R$ ${formatarMoeda(total)}`;
}

function calcularSubtotal() {
  return carrinho.reduce((acc, item) => {
    return acc + (item.preco * item.quantidade);
  }, 0);
}

// =========================
// ENTREGA
// =========================
function calcularTaxaEntrega() {
  const tipoEntrega = tipoEntregaInput ? tipoEntregaInput.value : "retirada";

  if (tipoEntrega !== "delivery") {
    return 0;
  }

  const distancia = parseFloat(distanciaInput?.value || "0");

  if (isNaN(distancia) || distancia <= 0) {
    return APP_CONFIG.taxaMinima;
  }

  if (distancia <= APP_CONFIG.raioMinimoKm) {
    return APP_CONFIG.taxaMinima;
  }

  const excedente = Math.ceil(distancia - APP_CONFIG.raioMinimoKm);
  return APP_CONFIG.taxaMinima + (excedente * APP_CONFIG.valorPorKm);
}

function atualizarVisibilidadeEntrega() {
  const tipoEntrega = tipoEntregaInput ? tipoEntregaInput.value : "retirada";

  const camposDelivery = document.querySelectorAll(".campo-delivery");

  camposDelivery.forEach((campo) => {
    campo.style.display = tipoEntrega === "delivery" ? "block" : "none";
  });
}

// =========================
// STATUS LOJA
// =========================
function atualizarStatusLoja() {
  if (!statusLojaEl) return;

  const aberta = lojaEstaAberta(
    APP_CONFIG.horarioAbertura,
    APP_CONFIG.horarioFechamento
  );

  statusLojaEl.textContent = aberta ? "Aberto agora" : "Fechado agora";
  statusLojaEl.classList.remove("aberto", "fechado");
  statusLojaEl.classList.add(aberta ? "aberto" : "fechado");
}

function lojaEstaAberta(horaAbertura, horaFechamento) {
  const agora = new Date();

  const [abH, abM] = horaAbertura.split(":").map(Number);
  const [fcH, fcM] = horaFechamento.split(":").map(Number);

  const abertura = new Date();
  abertura.setHours(abH, abM, 0, 0);

  const fechamento = new Date();
  fechamento.setHours(fcH, fcM, 0, 0);

  if (fechamento <= abertura) {
    if (agora >= abertura) {
      fechamento.setDate(fechamento.getDate() + 1);
    } else {
      abertura.setDate(abertura.getDate() - 1);
    }
  }

  return agora >= abertura && agora <= fechamento;
}

// =========================
// WHATSAPP
// =========================
function enviarPedidoWhatsApp() {
  if (carrinho.length === 0) {
    alert("Adicione pelo menos um item ao carrinho.");
    return;
  }

  const nome = nomeInput?.value.trim() || "";
  const endereco = enderecoInput?.value.trim() || "";
  const numero = numeroInput?.value.trim() || "";
  const bairro = bairroInput?.value.trim() || "";
  const referencia = referenciaInput?.value.trim() || "";
  const pagamento = pagamentoInput?.value.trim() || "";
  const observacao = observacaoInput?.value.trim() || "";
  const tipoEntrega = tipoEntregaInput?.value || "retirada";
  const distancia = distanciaInput?.value.trim() || "";

  if (!nome) {
    alert("Preencha o nome do cliente.");
    return;
  }

  if (tipoEntrega === "delivery") {
    if (!endereco || !numero || !bairro) {
      alert("Preencha endereço, número e bairro para delivery.");
      return;
    }
  }

  const subtotal = calcularSubtotal();
  const taxaEntrega = calcularTaxaEntrega();
  const total = subtotal + taxaEntrega;

  salvarPedidoLocal({
    nome,
    tipoEntrega: tipoEntrega === "delivery" ? "Delivery" : "Retirada",
    endereco,
    numero,
    bairro,
    referencia,
    distancia,
    pagamento,
    observacao,
    itens: carrinho.map((item) => ({ ...item })),
    subtotal,
    taxaEntrega,
    total
  });

  let mensagem = `🍔 *NOVO PEDIDO - CHAPA LANCHES*%0A%0A`;
  mensagem += `👤 *Cliente:* ${encodeURIComponent(nome)}%0A`;
  mensagem += `🛍️ *Tipo:* ${encodeURIComponent(tipoEntrega === "delivery" ? "Delivery" : "Retirada")}%0A%0A`;

  mensagem += `📋 *Itens do pedido:*%0A`;

  carrinho.forEach((item) => {
    mensagem += `- ${item.quantidade}x ${encodeURIComponent(item.nome)} = R$ ${formatarMoeda(item.preco * item.quantidade)}%0A`;
  });

  mensagem += `%0A`;
  mensagem += `💰 *Subtotal:* R$ ${formatarMoeda(subtotal)}%0A`;

  if (tipoEntrega === "delivery") {
    mensagem += `🚚 *Taxa de entrega:* R$ ${formatarMoeda(taxaEntrega)}%0A`;

    if (distancia) {
      mensagem += `📍 *Distância informada:* ${encodeURIComponent(distancia)} km%0A`;
    }
  }

  mensagem += `🧾 *Total:* R$ ${formatarMoeda(total)}%0A%0A`;

  if (tipoEntrega === "delivery") {
    mensagem += `🏠 *Endereço:* ${encodeURIComponent(endereco)}, ${encodeURIComponent(numero)} - ${encodeURIComponent(bairro)}%0A`;

    if (referencia) {
      mensagem += `📌 *Referência:* ${encodeURIComponent(referencia)}%0A`;
    }
  }

  if (pagamento) {
    mensagem += `💳 *Pagamento:* ${encodeURIComponent(pagamento)}%0A`;
  }

  if (observacao) {
    mensagem += `📝 *Observação:* ${encodeURIComponent(observacao)}%0A`;
  }

  const url = `https://wa.me/${APP_CONFIG.telefone}?text=${mensagem}`;
  window.open(url, "_blank");

  limparFormularioAposPedido();
}

// =========================
// SALVAR PEDIDO LOCAL
// =========================
function salvarPedidoLocal(dadosPedido) {
  const chave = "chapa_lanches_pedidos";

  let pedidos = [];

  try {
    pedidos = JSON.parse(localStorage.getItem(chave)) || [];
  } catch (error) {
    pedidos = [];
  }

  const agora = new Date();

  const novoPedido = {
    id: Date.now(),
    dataIso: agora.toISOString(),
    dataFormatada: agora.toLocaleString("pt-BR"),
    status: "Recebido",
    ...dadosPedido
  };

  pedidos.push(novoPedido);
  localStorage.setItem(chave, JSON.stringify(pedidos));
}

// =========================
// LIMPAR FORMULÁRIO
// =========================
function limparFormularioAposPedido() {
  carrinho = [];
  atualizarCarrinho();

  if (nomeInput) nomeInput.value = "";
  if (enderecoInput) enderecoInput.value = "";
  if (numeroInput) numeroInput.value = "";
  if (bairroInput) bairroInput.value = "";
  if (referenciaInput) referenciaInput.value = "";
  if (pagamentoInput) pagamentoInput.value = "";
  if (observacaoInput) observacaoInput.value = "";
  if (distanciaInput) distanciaInput.value = "";

  if (tipoEntregaInput) {
    tipoEntregaInput.value = "retirada";
  }

  atualizarVisibilidadeEntrega();
  atualizarCarrinho();
}

// =========================
// UTILITÁRIOS
// =========================
function formatarMoeda(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

function escapeAspas(texto) {
  return String(texto).replace(/'/g, "\\'");
}
