// =========================
// CHAPA LANCHES - ADMIN.JS
// Painel simples com localStorage
// =========================

const LISTA_PEDIDOS_KEY = "chapa_lanches_pedidos";

const pedidosContainer = document.getElementById("pedidos-container");
const totalPedidosEl = document.getElementById("total-pedidos");
const totalHojeEl = document.getElementById("total-hoje");
const faturamentoHojeEl = document.getElementById("faturamento-hoje");
const btnLimparPedidos = document.getElementById("btn-limpar-pedidos");

document.addEventListener("DOMContentLoaded", () => {
  carregarPainel();
  configurarEventos();

  // atualiza sozinho a cada 5 segundos
  setInterval(carregarPainel, 5000);
});

function configurarEventos() {
  if (btnLimparPedidos) {
    btnLimparPedidos.addEventListener("click", limparTodosPedidos);
  }
}

function carregarPainel() {
  const pedidos = obterPedidos();

  atualizarResumo(pedidos);
  renderizarPedidos(pedidos);
}

function obterPedidos() {
  try {
    const dados = localStorage.getItem(LISTA_PEDIDOS_KEY);
    return dados ? JSON.parse(dados) : [];
  } catch (error) {
    console.error("Erro ao ler pedidos:", error);
    return [];
  }
}

function salvarPedidos(pedidos) {
  localStorage.setItem(LISTA_PEDIDOS_KEY, JSON.stringify(pedidos));
}

function atualizarResumo(pedidos) {
  if (totalPedidosEl) {
    totalPedidosEl.textContent = pedidos.length;
  }

  const hoje = new Date().toISOString().slice(0, 10);

  const pedidosHoje = pedidos.filter((pedido) => {
    return (pedido.dataIso || "").slice(0, 10) === hoje;
  });

  if (totalHojeEl) {
    totalHojeEl.textContent = pedidosHoje.length;
  }

  const faturamentoHoje = pedidosHoje.reduce((total, pedido) => {
    return total + Number(pedido.total || 0);
  }, 0);

  if (faturamentoHojeEl) {
    faturamentoHojeEl.textContent = `R$ ${formatarMoeda(faturamentoHoje)}`;
  }
}

function renderizarPedidos(pedidos) {
  if (!pedidosContainer) return;

  pedidosContainer.innerHTML = "";

  if (!pedidos.length) {
    pedidosContainer.innerHTML = `
      <div class="pedido">
        <h4>Nenhum pedido encontrado</h4>
        <p>Ainda não existem pedidos salvos no painel.</p>
      </div>
    `;
    return;
  }

  const pedidosOrdenados = [...pedidos].sort((a, b) => {
    return new Date(b.dataIso) - new Date(a.dataIso);
  });

  pedidosOrdenados.forEach((pedido) => {
    const card = document.createElement("div");
    card.className = "pedido";

    const itensHtml = (pedido.itens || [])
      .map((item) => {
        return `<li>${item.quantidade}x ${escapeHtml(item.nome)} - R$ ${formatarMoeda(item.preco * item.quantidade)}</li>`;
      })
      .join("");

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div>
          <h4>Pedido #${pedido.id}</h4>
          <p><strong>Cliente:</strong> ${escapeHtml(pedido.nome || "-")}</p>
          <p><strong>Tipo:</strong> ${escapeHtml(pedido.tipoEntrega || "-")}</p>
          <p><strong>Status:</strong> <span style="font-weight:bold;">${escapeHtml(pedido.status || "Recebido")}</span></p>
          <p><strong>Data:</strong> ${escapeHtml(pedido.dataFormatada || "-")}</p>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" onclick="alterarStatusPedido(${pedido.id}, 'Recebido')" style="padding:8px 12px;background:#f2b300;color:#000;border:none;border-radius:8px;cursor:pointer;">
            Recebido
          </button>
          <button type="button" onclick="alterarStatusPedido(${pedido.id}, 'Em preparo')" style="padding:8px 12px;background:#3498db;color:#fff;border:none;border-radius:8px;cursor:pointer;">
            Em preparo
          </button>
          <button type="button" onclick="alterarStatusPedido(${pedido.id}, 'Saiu para entrega')" style="padding:8px 12px;background:#9b59b6;color:#fff;border:none;border-radius:8px;cursor:pointer;">
            Saiu
          </button>
          <button type="button" onclick="alterarStatusPedido(${pedido.id}, 'Finalizado')" style="padding:8px 12px;background:#25d366;color:#fff;border:none;border-radius:8px;cursor:pointer;">
            Finalizado
          </button>
          <button type="button" onclick="excluirPedido(${pedido.id})" style="padding:8px 12px;background:#ff5a5a;color:#fff;border:none;border-radius:8px;cursor:pointer;">
            Excluir
          </button>
        </div>
      </div>

      <hr style="margin:12px 0;border:none;border-top:1px solid #2d2d2d;">

      <p><strong>Itens:</strong></p>
      <ul style="margin:8px 0 12px 18px;">
        ${itensHtml}
      </ul>

      <p><strong>Subtotal:</strong> R$ ${formatarMoeda(pedido.subtotal || 0)}</p>
      <p><strong>Taxa:</strong> R$ ${formatarMoeda(pedido.taxaEntrega || 0)}</p>
      <p><strong>Total:</strong> R$ ${formatarMoeda(pedido.total || 0)}</p>

      ${
        pedido.tipoEntrega === "delivery"
          ? `
            <p><strong>Endereço:</strong> ${escapeHtml(pedido.endereco || "-")}, ${escapeHtml(pedido.numero || "-")} - ${escapeHtml(pedido.bairro || "-")}</p>
            <p><strong>Referência:</strong> ${escapeHtml(pedido.referencia || "-")}</p>
            <p><strong>Distância:</strong> ${escapeHtml(String(pedido.distancia || "-"))} km</p>
          `
          : ""
      }

      <p><strong>Pagamento:</strong> ${escapeHtml(pedido.pagamento || "-")}</p>
      <p><strong>Observação:</strong> ${escapeHtml(pedido.observacao || "-")}</p>
    `;

    pedidosContainer.appendChild(card);
  });
}

function alterarStatusPedido(id, novoStatus) {
  const pedidos = obterPedidos();

  const pedido = pedidos.find((p) => Number(p.id) === Number(id));
  if (!pedido) return;

  pedido.status = novoStatus;

  salvarPedidos(pedidos);
  carregarPainel();
}

function excluirPedido(id) {
  const confirmar = confirm("Deseja realmente excluir este pedido?");
  if (!confirmar) return;

  const pedidos = obterPedidos().filter((p) => Number(p.id) !== Number(id));
  salvarPedidos(pedidos);
  carregarPainel();
}

function limparTodosPedidos() {
  const confirmar = confirm("Deseja apagar todos os pedidos?");
  if (!confirmar) return;

  localStorage.removeItem(LISTA_PEDIDOS_KEY);
  carregarPainel();
}

function formatarMoeda(valor) {
  return Number(valor || 0).toFixed(2).replace(".", ",");
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
