const numeroWhatsapp = (window.APP_CONFIG && window.APP_CONFIG.whatsappNumber) || '5515996179172';
const nomeLoja = (window.APP_CONFIG && window.APP_CONFIG.storeName) || 'Chapa Lanches';
const ENDERECO_LOJA_PADRAO = 'Avenida Doutor Artur Bernardes, 235, Sorocaba, SP, 18081-000';
const TEMPO_PREPARO_FIXO_MINUTOS = 45;

const REGRAS_ENTREGA_PADRAO = [
  { km_min: 0, km_max: 3, fee: 4, active: true },
  { km_min: 3.01, km_max: 5, fee: 6, active: true },
  { km_min: 5.01, km_max: 6, fee: 7, active: true },
  { km_min: 6.01, km_max: 7, fee: 8, active: true },
  { km_min: 7.01, km_max: 8, fee: 10, active: true },
  { km_min: 8.01, km_max: 9, fee: 12, active: true },
  { km_min: 9.01, km_max: 10, fee: 15, active: true }
];

const PRODUTOS_COM_OPCOES = {
  duplo: {
    id: 'duplo',
    nome: 'Hot Dog Duplo',
    preco: 16,
    titulo: 'Hot Dog Duplo',
    descricao: 'Escolha o queijo do seu lanche:',
    grupoLabel: 'Queijo',
    obrigatorio: true,
    opcoes: ['Catupiry', 'Cheddar', 'Mussarela']
  },
  xfrango: {
    id: 'xfrango',
    nome: 'X-Frango',
    preco: 21,
    titulo: 'X-Frango',
    descricao: 'Escolha o queijo do seu lanche:',
    grupoLabel: 'Queijo',
    obrigatorio: true,
    opcoes: ['Catupiry', 'Cheddar', 'Mussarela']
  },
  xfrangoespecial: {
    id: 'xfrangoespecial',
    nome: 'X-Frango Especial',
    preco: 22,
    titulo: 'X-Frango Especial',
    descricao: 'Escolha um complemento do seu lanche:',
    grupoLabel: 'Complemento',
    obrigatorio: true,
    opcoes: ['Bacon', 'Calabresa']
  }
};

let supabaseClient = null;

if (
  window.supabase &&
  window.APP_CONFIG &&
  window.APP_CONFIG.supabaseUrl &&
  window.APP_CONFIG.supabaseAnonKey
) {
  supabaseClient = window.supabase.createClient(
    window.APP_CONFIG.supabaseUrl,
    window.APP_CONFIG.supabaseAnonKey
  );
}

let carrinho = [];
let taxaEntrega = 0;
let distanciaEntregaKm = null;
let tempoEntregaTexto = null;
let regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
let configuracaoLoja = null;
let timeoutCalculoEntrega = null;
let produtoOpcoesAtual = null;
let adicionalPendente = null;
let preenchendoEnderecoAutomaticamente = false;
let preenchendoCepAutomaticamente = false;
let coordenadaClienteCache = null;

function formatarPreco(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function somenteNumeros(texto) {
  return (texto || '').replace(/\D/g, '');
}

function removerAcentos(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatarTipoEntregaTexto(tipo) {
  return tipo === 'delivery' ? 'Delivery' : 'Retirada no local';
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function abrirWhatsapp(url) {
  if (isIOS()) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }
}

function obterElementoStatusLoja() {
  return document.getElementById('statusLoja') || document.getElementById('status-loja');
}

function obterCamposEndereco() {
  return {
    cep: document.getElementById('cepEntrega'),
    rua: document.getElementById('ruaEntrega'),
    numero: document.getElementById('numeroEntrega'),
    bairro: document.getElementById('bairroEntrega'),
    cidade: document.getElementById('cidadeEntrega'),
    complemento: document.getElementById('complementoEntrega')
  };
}

function obterEnderecoAtualComoChave() {
  const rua = document.getElementById('ruaEntrega')?.value.trim() || '';
  const numero = document.getElementById('numeroEntrega')?.value.trim() || '';
  const bairro = document.getElementById('bairroEntrega')?.value.trim() || '';
  const cidade = document.getElementById('cidadeEntrega')?.value.trim() || 'Sorocaba';
  const cep = document.getElementById('cepEntrega')?.value.trim() || '';

  return [rua, numero, bairro, cidade, cep].join('|').toLowerCase();
}

function limparCacheCoordenadaCliente() {
  coordenadaClienteCache = null;
}

function definirBloqueioCampos() {
  const { cep, rua, numero, bairro, cidade } = obterCamposEndereco();

  if (cep) cep.readOnly = false;

  if (rua) rua.readOnly = true;
  if (bairro) bairro.readOnly = true;
  if (cidade) cidade.readOnly = true;

  if (numero) numero.readOnly = false;
}

function limparBloqueiosEndereco() {
  definirBloqueioCampos();
}

function enderecoBasePreenchido() {
  const { rua, bairro, cidade } = obterCamposEndereco();
  return !!(
    rua?.value.trim() ||
    bairro?.value.trim() ||
    (cidade?.value.trim() && cidade.value.trim().toLowerCase() !== 'sorocaba')
  );
}

function sincronizarBloqueiosEndereco(origem = '') {
  if (preenchendoEnderecoAutomaticamente || preenchendoCepAutomaticamente) return;

  const { cep } = obterCamposEndereco();
  const cepDigitado = somenteNumeros(cep?.value || '');

  if (origem === 'cep') {
    if (cepDigitado.length > 0) {
      definirBloqueioCampos({
        bloquearCep: false,
        bloquearEndereco: true
      });
    } else {
      limparBloqueiosEndereco();
    }
    return;
  }

  if (origem === 'endereco') {
    if (enderecoBasePreenchido()) {
      definirBloqueioCampos({
        bloquearCep: true,
        bloquearEndereco: false
      });
    } else {
      limparBloqueiosEndereco();
    }
    return;
  }

  if (cepDigitado.length > 0) {
    definirBloqueioCampos({
      bloquearCep: false,
      bloquearEndereco: true
    });
    return;
  }

  if (enderecoBasePreenchido()) {
    definirBloqueioCampos({
      bloquearCep: true,
      bloquearEndereco: false
    });
    return;
  }

  limparBloqueiosEndereco();
}

function aplicarMascaraCep() {
  const input = document.getElementById('cepEntrega');
  if (!input) return;

  input.addEventListener('input', function () {
    let valor = somenteNumeros(input.value).slice(0, 8);

    if (valor.length > 5) {
      valor = valor.slice(0, 5) + '-' + valor.slice(5);
    }

    input.value = valor;
    limparCacheCoordenadaCliente();
    sincronizarBloqueiosEndereco('cep');
    agendarCalculoEntrega();
  });

  input.addEventListener('blur', buscarCepEntrega);
}

function aplicarEventosEntrega() {
  const idsCalculo = [
    'ruaEntrega',
    'numeroEntrega',
    'bairroEntrega',
    'cidadeEntrega',
    'complementoEntrega'
  ];

  idsCalculo.forEach(id => {
    const campo = document.getElementById(id);
    if (!campo) return;

    campo.addEventListener('input', () => {
      limparCacheCoordenadaCliente();

      if (id === 'ruaEntrega' || id === 'bairroEntrega' || id === 'cidadeEntrega') {
        sincronizarBloqueiosEndereco('endereco');
      }

      agendarCalculoEntrega();
    });

    campo.addEventListener('change', () => {
      limparCacheCoordenadaCliente();

      if (id === 'ruaEntrega' || id === 'bairroEntrega' || id === 'cidadeEntrega') {
        sincronizarBloqueiosEndereco('endereco');
      }

      agendarCalculoEntrega();
    });

    campo.addEventListener('blur', async () => {
      if (id === 'ruaEntrega' || id === 'bairroEntrega' || id === 'cidadeEntrega') {
        sincronizarBloqueiosEndereco('endereco');
        await buscarCepPorEndereco();
      }

      agendarCalculoEntrega();
    });
  });
}

function agendarCalculoEntrega() {
  clearTimeout(timeoutCalculoEntrega);
  timeoutCalculoEntrega = setTimeout(() => {
    calcularEntregaAutomaticamente();
  }, 700);
}

function montarEnderecoCompletoCliente() {
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const bairro = document.getElementById('bairroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
  const cep = document.getElementById('cepEntrega').value.trim();

  const partes = [];

  if (rua) partes.push(rua);
  if (numero) partes.push(numero);
  if (bairro) partes.push(bairro);
  if (cidade) partes.push(cidade);
  partes.push('SP');
  if (cep) partes.push(cep);
  partes.push('Brasil');

  return partes.join(', ');
}

function enderecoClienteTextoHumano() {
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const bairro = document.getElementById('bairroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim() || 'Sorocaba';
  const cep = document.getElementById('cepEntrega').value.trim();
  const complemento = document.getElementById('complementoEntrega').value.trim();

  const partes = [];

  if (rua) partes.push(rua);
  if (numero) partes.push(numero);
  if (bairro) partes.push(bairro);
  if (cidade) partes.push(cidade);
  if (cep) partes.push(`CEP ${cep}`);
  if (complemento) partes.push(complemento);

  return partes.join(', ');
}

function salvarCoordenadaClienteNoCache(coordenada) {
  if (!coordenada) return;

  coordenadaClienteCache = {
    chave: obterEnderecoAtualComoChave(),
    valor: coordenada
  };
}

function obterCoordenadaClienteDoCache() {
  const chaveAtual = obterEnderecoAtualComoChave();

  if (coordenadaClienteCache && coordenadaClienteCache.chave === chaveAtual) {
    return coordenadaClienteCache.valor;
  }

  return null;
}

async function buscarCepEntrega() {

  const campoCep = document.getElementById('cepEntrega');
  const avisoEntrega = document.getElementById('avisoEntrega');
  const ruaCampo = document.getElementById('ruaEntrega');
  const bairroCampo = document.getElementById('bairroEntrega');
  const cidadeCampo = document.getElementById('cidadeEntrega');
  const numeroCampo = document.getElementById('numeroEntrega');

  if (!campoCep || !avisoEntrega) return;

  const cep = somenteNumeros(campoCep.value);

  if (!cep) {
    return;
  }

  if (cep.length !== 8) {
    avisoEntrega.innerText = 'Digite um CEP válido.';
    return;
  }

  try {

    avisoEntrega.innerText = 'Consultando CEP...';

    const resposta = await fetch(
      `https://viacep.com.br/ws/${cep}/json/`
    );

    const dados = await resposta.json();

    if (dados.erro) {
      avisoEntrega.innerText = 'CEP não encontrado.';
      return;
    }

    ruaCampo.value = dados.logradouro || '';
    bairroCampo.value = dados.bairro || '';
    cidadeCampo.value = dados.localidade || 'Sorocaba';

    limparCacheCoordenadaCliente();

    // trava rua/bairro/cidade e deixa só número editar
    definirBloqueioCampos();

    // joga cursor pro número
    if (numeroCampo) {
      numeroCampo.focus();
    }

    avisoEntrega.innerText =
      'CEP localizado. Informe somente o número.';

    agendarCalculoEntrega();

  } catch(e) {

    console.error(e);

    avisoEntrega.innerText =
      'Erro ao consultar CEP.';

  }

}

    avisoEntrega.innerText = 'CEP localizado. Informe o número para calcular a taxa.';
    await calcularEntregaAutomaticamente();
  } catch (erro) {
    preenchendoEnderecoAutomaticamente = false;
    console.error(erro);
    limparBloqueiosEndereco();
    limparCacheCoordenadaCliente();
    avisoEntrega.innerText = 'Não foi possível consultar o CEP agora.';
  }
}

async function buscarCepPorEndereco() {
  return;
}

  try {
    if (avisoEntrega) {
      avisoEntrega.innerText = 'Buscando CEP pelo endereço...';
    }

    preenchendoCepAutomaticamente = true;

    const endereco = [rua, numero, bairro, cidade, 'SP', 'Brasil']
      .filter(Boolean)
      .join(', ');

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;

    const resposta = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!resposta.ok) {
      throw new Error('Erro ao consultar o endereço.');
    }

    const dados = await resposta.json();

    if (Array.isArray(dados) && dados.length > 0) {
      const primeiro = dados[0];
      const postcode = primeiro?.address?.postcode || '';

      if (primeiro?.lat && primeiro?.lon) {
        salvarCoordenadaClienteNoCache({
          lat: Number(primeiro.lat),
          lng: Number(primeiro.lon),
          display_name: primeiro.display_name || endereco
        });
      }

      if (postcode) {
        const cepNumerico = somenteNumeros(postcode).slice(0, 8);
        let cepFormatado = cepNumerico;

        if (cepNumerico.length > 5) {
          cepFormatado = cepNumerico.slice(0, 5) + '-' + cepNumerico.slice(5);
        }

        if (campoCep) {
          campoCep.value = cepFormatado;
        }

        definirBloqueioCampos({
          bloquearCep: true,
          bloquearEndereco: false
        });

        if (avisoEntrega) {
          avisoEntrega.innerText = 'CEP localizado automaticamente pelo endereço.';
        }

        await calcularEntregaAutomaticamente();
      } else {
        if (campoCep) campoCep.value = '';

        if (avisoEntrega) {
          avisoEntrega.innerText = 'Endereço localizado, mas o CEP não foi encontrado automaticamente.';
        }
      }
    } else {
      if (campoCep) campoCep.value = '';
      limparCacheCoordenadaCliente();

      if (avisoEntrega) {
        avisoEntrega.innerText = 'Não foi possível localizar o CEP pelo endereço digitado.';
      }
    }
  } catch (erro) {
    console.error('Erro ao buscar CEP pelo endereço:', erro);

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Não foi possível buscar o CEP pelo endereço agora.';
    }
  } finally {
    preenchendoCepAutomaticamente = false;
  }
}

function atualizarContadores() {
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const cartCount = document.getElementById('cartCount');
  if (cartCount) {
    cartCount.innerText = totalItens;
  }
}

function gerarChaveItem(nome, preco, observacao = '') {
  return `${nome}||${preco}||${observacao}`;
}

function adicionarAoCarrinho(nome, preco, observacao = '') {
  const chave = gerarChaveItem(nome, preco, observacao);
  const itemExistente = carrinho.find(item => item.chave === chave);

  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    carrinho.push({
      chave,
      nome,
      preco,
      quantidade: 1,
      observacao
    });
  }

  atualizarContadores();
}

function abrirOpcoesProduto(produtoId) {
  const produto = PRODUTOS_COM_OPCOES[produtoId];
  const modal = document.getElementById('modalOpcoesProduto');
  const titulo = document.getElementById('tituloOpcoesProduto');
  const descricao = document.getElementById('descricaoOpcoesProduto');
  const lista = document.getElementById('listaOpcoesProduto');

  if (!produto || !modal || !titulo || !descricao || !lista) return;

  adicionalPendente = null;
  produtoOpcoesAtual = produto;
  titulo.innerText = produto.titulo;
  descricao.innerText = produto.descricao;

  lista.innerHTML = produto.opcoes.map((opcao) => `
    <label style="display:flex; align-items:center; gap:10px; padding:12px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; cursor:pointer;">
      <input type="radio" name="opcaoProdutoAtual" value="${escaparHtml(opcao)}">
      <span>${escaparHtml(opcao)}</span>
    </label>
  `).join('');

  modal.style.display = 'flex';
  modal.classList.add('ativo');
}

function fecharOpcoesProduto() {
  const modal = document.getElementById('modalOpcoesProduto');
  const lista = document.getElementById('listaOpcoesProduto');

  produtoOpcoesAtual = null;
  adicionalPendente = null;

  if (lista) {
    lista.innerHTML = '';
  }

  if (modal) {
    modal.classList.remove('ativo');
    modal.style.display = 'none';
  }
}

function confirmarOpcoesProduto() {
  if (adicionalPendente) {
    const selecionado = document.querySelector('input[name="lancheAdicional"]:checked');

    if (!selecionado) {
      alert('Selecione um lanche para adicionar o item.');
      return;
    }

    const index = Number(selecionado.value);
    const lanche = carrinho[index];

    if (!lanche) {
      alert('Lanche não encontrado.');
      return;
    }

    lanche.preco = Number(lanche.preco || 0) + Number(adicionalPendente.preco || 0);

    lanche.observacao = lanche.observacao
      ? lanche.observacao + ' | Adicional: ' + adicionalPendente.nome
      : 'Adicional: ' + adicionalPendente.nome;

    adicionalPendente = null;

    fecharOpcoesProduto();
    renderizarCarrinho();
    return;
  }

  if (!produtoOpcoesAtual) return;

  const selecionado = document.querySelector('input[name="opcaoProdutoAtual"]:checked');

  if (produtoOpcoesAtual.obrigatorio && !selecionado) {
    alert('Selecione uma opção para continuar.');
    return;
  }

  const valorSelecionado = selecionado ? selecionado.value : '';
  const observacao = valorSelecionado
    ? `${produtoOpcoesAtual.grupoLabel}: ${valorSelecionado}`
    : '';

  adicionarAoCarrinho(
    produtoOpcoesAtual.nome,
    produtoOpcoesAtual.preco,
    observacao
  );

  fecharOpcoesProduto();
}

function aumentarQuantidade(index) {
  carrinho[index].quantidade += 1;
  renderizarCarrinho();
}

function diminuirQuantidade(index) {
  carrinho[index].quantidade -= 1;

  if (carrinho[index].quantidade <= 0) {
    carrinho.splice(index, 1);
  }

  renderizarCarrinho();
}

function removerItem(index) {
  carrinho.splice(index, 1);
  renderizarCarrinho();
}

function calcularSubtotal() {
  return carrinho.reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
}

function calcularTotal() {
  return calcularSubtotal() + taxaEntrega;
}

function converterHorarioParaMinutos(horario) {
  if (!horario) return null;

  const partes = String(horario).split(':');
  const hora = Number(partes[0] || 0);
  const minuto = Number(partes[1] || 0);

  return (hora * 60) + minuto;
}

function obterDiasPermitidosLoja() {
  return [0, 3, 4, 5, 6];
}

function lojaAbertaPorHorario(config = null) {
  const agora = new Date();
  const dia = agora.getDay();

  if (!obterDiasPermitidosLoja().includes(dia)) {
    return false;
  }

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  const abre = converterHorarioParaMinutos(config?.open_time) ?? (19 * 60);
  const fecha = converterHorarioParaMinutos(config?.close_time) ?? (22 * 60 + 30);

  return minutosAgora >= abre && minutosAgora < fecha;
}

function obterConfiguracaoLojaPadrao() {
  return {
    id: 1,
    store_name: nomeLoja,
    whatsapp_number: numeroWhatsapp,
    store_address: ENDERECO_LOJA_PADRAO,
    store_lat: null,
    store_lng: null,
    open_time: '19:00:00',
    close_time: '22:30:00',
    auto_open: true,
    manual_force_open: false,
    manual_force_closed: false
  };
}

async function carregarConfiguracaoLoja() {
  if (!supabaseClient) {
    configuracaoLoja = obterConfiguracaoLojaPadrao();
    return configuracaoLoja;
  }

  try {
    const { data, error } = await supabaseClient
      .from('store_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Erro ao carregar configuração da loja:', error);
      configuracaoLoja = obterConfiguracaoLojaPadrao();
      return configuracaoLoja;
    }

    configuracaoLoja = data || obterConfiguracaoLojaPadrao();
    return configuracaoLoja;
  } catch (erro) {
    console.error('Falha ao carregar configuração:', erro);
    configuracaoLoja = obterConfiguracaoLojaPadrao();
    return configuracaoLoja;
  }
}

async function atualizarConfiguracaoLojaStatus() {
  if (!supabaseClient) {
    if (!configuracaoLoja) {
      configuracaoLoja = obterConfiguracaoLojaPadrao();
    }
    return configuracaoLoja;
  }

  try {
    const { data, error } = await supabaseClient
      .from('store_settings')
      .select('id, open_time, close_time, auto_open, manual_force_open, manual_force_closed')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Erro ao atualizar status da loja:', error);
      return configuracaoLoja || obterConfiguracaoLojaPadrao();
    }

    configuracaoLoja = {
      ...(configuracaoLoja || obterConfiguracaoLojaPadrao()),
      ...data
    };

    return configuracaoLoja;
  } catch (erro) {
    console.error('Falha ao atualizar status da loja:', erro);
    return configuracaoLoja || obterConfiguracaoLojaPadrao();
  }
}

async function lojaAbertaAgora() {
  const config = await atualizarConfiguracaoLojaStatus();

  if (!config) return false;

  if (config.manual_force_open === true) {
    return true;
  }

  if (config.manual_force_closed === true) {
    return false;
  }

  if (config.auto_open === true) {
    return lojaAbertaPorHorario(config);
  }

  return false;
}

async function atualizarStatusLoja() {
  const statusLoja = obterElementoStatusLoja();
  const btnFinalizar = document.getElementById('btnFinalizar');
  const aberta = await lojaAbertaAgora();

  if (statusLoja) {
    if (aberta) {
      statusLoja.classList.remove('fechado');
      statusLoja.classList.add('aberto');
      statusLoja.innerText = '🟢 Aberto agora';
    } else {
      statusLoja.classList.remove('aberto');
      statusLoja.classList.add('fechado');
      statusLoja.innerText = '🔴 Fechado no momento';
    }
  }

  if (btnFinalizar) {
    btnFinalizar.disabled = !aberta;
  }
}

function atualizarEntrega() {
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const camposEntrega = document.getElementById('camposEntrega');
  const avisoEntrega = document.getElementById('avisoEntrega');

  if (tipoEntrega === 'delivery') {
    if (camposEntrega) {
      camposEntrega.style.display = 'grid';
    }

    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim();

    if (!rua || !numero || !bairro || !cidade) {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;

      if (avisoEntrega) {
        avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
      }
    } else {
      agendarCalculoEntrega();
    }
  } else {
    if (camposEntrega) {
      camposEntrega.style.display = 'none';
    }

    document.getElementById('cepEntrega').value = '';
    document.getElementById('ruaEntrega').value = '';
    document.getElementById('numeroEntrega').value = '';
    document.getElementById('bairroEntrega').value = '';
    document.getElementById('cidadeEntrega').value = 'Sorocaba';
    document.getElementById('complementoEntrega').value = '';

    limparBloqueiosEndereco();
    limparCacheCoordenadaCliente();

    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }
  }

  renderizarCarrinho();
}

function renderizarCarrinho() {
  const lista = document.getElementById('listaCarrinho');
  const subtotal = calcularSubtotal();
  const total = calcularTotal();

  if (lista) {
    if (carrinho.length === 0) {
      lista.innerHTML = '<div class="carrinho-vazio">Seu carrinho está vazio.</div>';
    } else {
      lista.innerHTML = `
        <div class="lista-carrinho">
          ${carrinho.map((item, index) => `
            <div class="item-carrinho">
              <div>
                <strong>${escaparHtml(item.nome)}</strong>
                ${item.observacao ? `<small style="display:block; margin-top:4px;">${escaparHtml(item.observacao)}</small>` : ''}
                <small>${formatarPreco(item.preco)} cada</small>
              </div>
              <div class="acoes-carrinho">
                <div class="qtd-box">
                  <button class="qtd-btn" onclick="diminuirQuantidade(${index})">-</button>
                  <strong>${item.quantidade}</strong>
                  <button class="qtd-btn" onclick="aumentarQuantidade(${index})">+</button>
                </div>
                <strong>${formatarPreco(item.preco * item.quantidade)}</strong>
                <button class="btn-remover" onclick="removerItem(${index})">Remover</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  const resumoItens = document.getElementById('resumoItens');
  const resumoSubtotal = document.getElementById('resumoSubtotal');
  const resumoTaxaEntrega = document.getElementById('resumoTaxaEntrega');
  const resumoTotal = document.getElementById('resumoTotal');

  if (resumoItens) {
    resumoItens.innerText = carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  }

  if (resumoSubtotal) {
    resumoSubtotal.innerText = formatarPreco(subtotal);
  }

  if (resumoTaxaEntrega) {
    resumoTaxaEntrega.innerText = formatarPreco(taxaEntrega);
  }

  if (resumoTotal) {
    resumoTotal.innerText = formatarPreco(total);
  }

  atualizarContadores();
  atualizarStatusLoja();
}

function abrirCarrinho() {
  renderizarCarrinho();
  const modal = document.getElementById('modalCarrinho');
  if (modal) {
    modal.classList.add('ativo');
  }
}

function fecharCarrinho() {
  const modal = document.getElementById('modalCarrinho');
  if (modal) {
    modal.classList.remove('ativo');
  }
}

function limparCarrinho() {
  carrinho = [];
  taxaEntrega = 0;
  distanciaEntregaKm = null;
  tempoEntregaTexto = null;
  produtoOpcoesAtual = null;
  adicionalPendente = null;

  document.getElementById('nomeCliente').value = '';
  document.getElementById('tipoEntrega').value = 'retirada';
  document.getElementById('cepEntrega').value = '';
  document.getElementById('ruaEntrega').value = '';
  document.getElementById('numeroEntrega').value = '';
  document.getElementById('bairroEntrega').value = '';
  document.getElementById('cidadeEntrega').value = 'Sorocaba';
  document.getElementById('complementoEntrega').value = '';
  document.getElementById('formaPagamento').value = '';
  document.getElementById('observacoes').value = '';

  limparBloqueiosEndereco();
  limparCacheCoordenadaCliente();

  atualizarEntrega();
  renderizarCarrinho();
}

async function carregarRegrasEntrega() {
  if (!supabaseClient) {
    regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('delivery_rules')
      .select('*')
      .eq('active', true)
      .order('km_min', { ascending: true });

    if (error) {
      console.error('Erro ao carregar regras de entrega:', error);
      regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
      return;
    }

    regrasEntrega = data && data.length > 0 ? data : [...REGRAS_ENTREGA_PADRAO];
  } catch (erro) {
    console.error('Falha ao carregar regras:', erro);
    regrasEntrega = [...REGRAS_ENTREGA_PADRAO];
  }
}

async function geocodificarEnderecoOpenStreetMap(endereco) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=br&q=${encodeURIComponent(endereco)}`;

  const resposta = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!resposta.ok) {
    throw new Error('Erro ao consultar geocodificação no OpenStreetMap.');
  }

  const dados = await resposta.json();

  if (!Array.isArray(dados) || dados.length === 0) {
    return null;
  }

  return {
    lat: Number(dados[0].lat),
    lng: Number(dados[0].lon),
    display_name: dados[0].display_name || endereco
  };
}

function gerarTentativasEndereco(endereco) {
  const base = String(endereco || '').trim();
  const semAcentos = removerAcentos(base);

  const tentativas = [
    base,
    base.replace(/,\s*\d+\s*,/g, ', '),
    base.replace(/,\s*\d{5}-?\d{3}/g, ''),
    base.replace(/,\s*Brasil/gi, ''),
    base
      .replace(/,\s*\d+\s*,/g, ', ')
      .replace(/,\s*\d{5}-?\d{3}/g, ''),
    base
      .replace(/,\s*\d+\s*,/g, ', ')
      .replace(/,\s*\d{5}-?\d{3}/g, '')
      .replace(/,\s*Brasil/gi, ''),
    (() => {
      const partes = base.split(',').map(p => p.trim()).filter(Boolean);
      if (partes.length >= 4) {
        const rua = partes[0] || '';
        const bairro = partes[2] || '';
        const cidade = partes[3] || '';
        return [rua, bairro, cidade, 'SP'].filter(Boolean).join(', ');
      }
      return base;
    })(),
    (() => {
      const partes = base.split(',').map(p => p.trim()).filter(Boolean);
      if (partes.length >= 4) {
        const rua = partes[0] || '';
        const cidade = partes[3] || '';
        return [rua, cidade, 'SP'].filter(Boolean).join(', ');
      }
      return base;
    })(),
    (() => {
      const cep = (base.match(/\d{5}-?\d{3}/) || [])[0];
      return cep || '';
    })(),
    semAcentos,
    semAcentos
      .replace(/,\s*\d+\s*,/g, ', ')
      .replace(/,\s*\d{5}-?\d{3}/g, '')
      .replace(/,\s*Brasil/gi, '')
  ];

  const unicas = [];
  const vistos = new Set();

  for (const tentativa of tentativas) {
    const texto = String(tentativa || '')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*$/, '')
      .trim();

    if (!texto) continue;

    const chave = texto.toLowerCase();
    if (vistos.has(chave)) continue;

    vistos.add(chave);
    unicas.push(texto);
  }

  return unicas;
}

async function geocodificarEnderecoProfissional(endereco) {
  const tentativas = gerarTentativasEndereco(endereco);

  for (const texto of tentativas) {
    try {
      console.log('Tentando geocodificar:', texto);
      const resultado = await geocodificarEnderecoOpenStreetMap(texto);

      if (resultado) {
        return resultado;
      }
    } catch (erro) {
      console.warn('Falhou ao geocodificar:', texto, erro.message);
    }
  }

  return null;
}

async function calcularRotaRealOSRM(origem, destino) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=false&steps=false`;

  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error('Erro ao calcular rota no OSRM.');
  }

  const dados = await resposta.json();

  if (!dados || dados.code !== 'Ok' || !dados.routes || !dados.routes.length) {
    throw new Error('Não foi possível calcular a rota.');
  }

  const rota = dados.routes[0];

  return {
    distanciaMetros: rota.distance,
    distanciaTexto: `${(rota.distance / 1000).toFixed(2)} km`,
    duracaoSegundos: rota.duration,
    duracaoTexto: formatarDuracao(rota.duration)
  };
}

function formatarDuracao(segundos) {
  const totalMin = Math.round(Number(segundos || 0) / 60);

  if (totalMin < 60) {
    return `${totalMin} min`;
  }

  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;

  if (minutos === 0) {
    return `${horas}h`;
  }

  return `${horas}h ${minutos}min`;
}

function somarTempoPreparoComEntrega(segundosEntrega) {
  const minutosEntrega = Math.round(Number(segundosEntrega || 0) / 60);
  const minutosTotais = TEMPO_PREPARO_FIXO_MINUTOS + minutosEntrega;
  return formatarDuracao(minutosTotais * 60);
}

function descobrirTaxaPorDistancia(distanciaKm) {
  if (!Number.isFinite(distanciaKm) || distanciaKm <= 0) {
    return 0;
  }

  if (regrasEntrega && regrasEntrega.length > 0) {
    const regra = regrasEntrega.find(r => {
      const min = Number(r.km_min);
      const max = Number(r.km_max);
      return distanciaKm >= min && distanciaKm <= max;
    });

    if (regra) {
      return Number(regra.fee);
    }
  }

  if (distanciaKm <= 3) {
    return 4;
  }

  return 4 + Math.ceil(distanciaKm - 3);
}

async function calcularEntregaAutomaticamente() {
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const avisoEntrega = document.getElementById('avisoEntrega');

  if (tipoEntrega !== 'delivery') {
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }

    renderizarCarrinho();
    return;
  }

  const cep = document.getElementById('cepEntrega').value.trim();
  const rua = document.getElementById('ruaEntrega').value.trim();
  const numero = document.getElementById('numeroEntrega').value.trim();
  const bairro = document.getElementById('bairroEntrega').value.trim();
  const cidade = document.getElementById('cidadeEntrega').value.trim();

  if (!cep || !rua || !numero || !bairro || !cidade) {
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Preencha CEP, rua, número, bairro e cidade para calcular a entrega.';
    }

    renderizarCarrinho();
    return;
  }

  if (avisoEntrega) {
    avisoEntrega.innerText = 'Calculando rota real e taxa de entrega...';
  }

  try {
    const enderecoLoja = configuracaoLoja?.store_address || ENDERECO_LOJA_PADRAO;
    const enderecoCliente = montarEnderecoCompletoCliente();

    let coordenadaLoja = null;
    let coordenadaCliente = null;

    if (configuracaoLoja?.store_lat && configuracaoLoja?.store_lng) {
      coordenadaLoja = {
        lat: Number(configuracaoLoja.store_lat),
        lng: Number(configuracaoLoja.store_lng),
        display_name: enderecoLoja
      };
    } else {
      coordenadaLoja = await geocodificarEnderecoProfissional(enderecoLoja);
    }

    coordenadaCliente = obterCoordenadaClienteDoCache();

    if (!coordenadaCliente) {
      coordenadaCliente = await geocodificarEnderecoProfissional(enderecoCliente);
      if (coordenadaCliente) {
        salvarCoordenadaClienteNoCache(coordenadaCliente);
      }
    }

    if (!coordenadaLoja || !coordenadaCliente) {
      taxaEntrega = 0;
      distanciaEntregaKm = null;
      tempoEntregaTexto = null;

      if (avisoEntrega) {
        avisoEntrega.innerText = 'Não foi possível localizar o endereço. Confira os dados digitados.';
      }

      renderizarCarrinho();
      return;
    }

    const rota = await calcularRotaRealOSRM(coordenadaLoja, coordenadaCliente);

    distanciaEntregaKm = Number((rota.distanciaMetros / 1000).toFixed(2));

    if (distanciaEntregaKm > 10) {
      taxaEntrega = 0;
      tempoEntregaTexto = null;
      distanciaEntregaKm = null;

      if (avisoEntrega) {
        avisoEntrega.innerText = 'Desculpe, entregamos somente até 10 km do estabelecimento.';
      }

      renderizarCarrinho();
      return;
    }

    tempoEntregaTexto = somarTempoPreparoComEntrega(rota.duracaoSegundos);
    taxaEntrega = descobrirTaxaPorDistancia(distanciaEntregaKm);

    if (avisoEntrega) {
      avisoEntrega.innerText = `Distância real: ${distanciaEntregaKm.toFixed(2)} km | Tempo estimado: ${tempoEntregaTexto || '-'} | Taxa: ${formatarPreco(taxaEntrega)}`;
    }

    renderizarCarrinho();
  } catch (erro) {
    console.error('Erro ao calcular entrega:', erro);
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Erro ao calcular a entrega. Tente novamente em instantes.';
    }

    renderizarCarrinho();
  }
}

async function salvarPedidoNoBanco(payload) {
  if (!supabaseClient) {
    return { id: Date.now() };
  }

  const { data, error } = await supabaseClient
    .from('orders')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar pedido:', error);
    throw error;
  }

  return data;
}

async function finalizarPedido() {
  if (carrinho.length === 0) {
    alert('Seu carrinho está vazio.');
    return;
  }

  if (!(await lojaAbertaAgora())) {
    alert('A loja está fechada no momento.');
    return;
  }

  const nome = document.getElementById('nomeCliente').value.trim();
  const tipoEntrega = document.getElementById('tipoEntrega').value;
  const pagamento = document.getElementById('formaPagamento').value;
  const observacoes = document.getElementById('observacoes').value.trim();
  const avisoEntrega = document.getElementById('avisoEntrega');
  const btnFinalizar = document.getElementById('btnFinalizar');

  const endereco = enderecoClienteTextoHumano();

  if (!nome) {
    alert('Digite seu nome.');
    return;
  }

  if (tipoEntrega === 'delivery') {
    const cep = document.getElementById('cepEntrega').value.trim();
    const rua = document.getElementById('ruaEntrega').value.trim();
    const numero = document.getElementById('numeroEntrega').value.trim();
    const bairro = document.getElementById('bairroEntrega').value.trim();
    const cidade = document.getElementById('cidadeEntrega').value.trim();

    if (!cep || !rua || !numero || !bairro || !cidade) {
      alert('Preencha CEP, rua, número, bairro e cidade.');
      return;
    }

    if (distanciaEntregaKm === null) {
      await calcularEntregaAutomaticamente();
    }

    if (distanciaEntregaKm === null) {
      alert('Não foi possível calcular a entrega. Verifique o endereço.');
      return;
    }
  }

  const subtotal = calcularSubtotal();
  const total = calcularTotal();

  const payload = {
    customer_name: nome,
    customer_phone: '',
    order_type: tipoEntrega,
    customer_address: tipoEntrega === 'delivery' ? endereco : null,
    customer_neighborhood: tipoEntrega === 'delivery' ? document.getElementById('bairroEntrega').value.trim() : null,
    customer_city: tipoEntrega === 'delivery' ? document.getElementById('cidadeEntrega').value.trim() : 'Sorocaba',
    customer_notes: [
      pagamento ? `Pagamento: ${pagamento}` : '',
      observacoes ? `Observações: ${observacoes}` : '',
      tipoEntrega === 'delivery' && document.getElementById('complementoEntrega').value.trim()
        ? `Complemento: ${document.getElementById('complementoEntrega').value.trim()}`
        : '',
      tipoEntrega === 'delivery' && tempoEntregaTexto
        ? `Tempo estimado: ${tempoEntregaTexto}`
        : ''
    ].filter(Boolean).join(' | '),
    items: carrinho.map(item => ({
      nome: item.nome,
      preco: item.preco,
      quantidade: item.quantidade,
      observacao: item.observacao || ''
    })),
    subtotal: subtotal,
    delivery_fee: taxaEntrega,
    total: total,
    delivery_distance_km: tipoEntrega === 'delivery' ? distanciaEntregaKm : null,
    status: 'novo'
  };

  try {
    if (btnFinalizar) {
      btnFinalizar.disabled = true;
      btnFinalizar.innerText = 'Salvando pedido...';
    }

    const pedidoSalvo = await salvarPedidoNoBanco(payload);

    let mensagem = `🍔 *Pedido - ${nomeLoja}*

*Pedido:* #${pedidoSalvo.id}
*Cliente:* ${nome}
*Tipo do pedido:* ${formatarTipoEntregaTexto(tipoEntrega)}`;

    if (tipoEntrega === 'delivery') {
      mensagem += `
*Endereço:* ${endereco}
*Distância real:* ${distanciaEntregaKm.toFixed(2)} km`;

      if (tempoEntregaTexto) {
        mensagem += `
*Tempo estimado:* ${tempoEntregaTexto}`;
      }
    } else {
      mensagem += `
*Tempo estimado:* ${formatarDuracao(TEMPO_PREPARO_FIXO_MINUTOS * 60)}`;
    }

    mensagem += `

*Itens do pedido:*`;

    carrinho.forEach(item => {
      mensagem += `
- ${item.quantidade}x ${item.nome} - ${formatarPreco(item.preco * item.quantidade)}`;

      if (item.observacao) {
        mensagem += `
  ↳ ${item.observacao}`;
      }
    });

    mensagem += `

*Subtotal:* ${formatarPreco(subtotal)}
*Taxa de entrega:* ${formatarPreco(taxaEntrega)}
*Total:* ${formatarPreco(total)}`;

    if (pagamento) {
      mensagem += `
*Pagamento:* ${pagamento}`;
    }

    if (observacoes) {
      mensagem += `
*Observações:* ${observacoes}`;
    }

    const textoWhatsapp = encodeURIComponent(mensagem);
    const urlWhatsapp = `https://wa.me/${numeroWhatsapp}?text=${textoWhatsapp}`;

    carrinho = [];
    taxaEntrega = 0;
    distanciaEntregaKm = null;
    tempoEntregaTexto = null;
    produtoOpcoesAtual = null;
    adicionalPendente = null;

    document.getElementById('nomeCliente').value = '';
    document.getElementById('tipoEntrega').value = 'retirada';
    document.getElementById('cepEntrega').value = '';
    document.getElementById('ruaEntrega').value = '';
    document.getElementById('numeroEntrega').value = '';
    document.getElementById('bairroEntrega').value = '';
    document.getElementById('cidadeEntrega').value = 'Sorocaba';
    document.getElementById('complementoEntrega').value = '';
    document.getElementById('formaPagamento').value = '';
    document.getElementById('observacoes').value = '';

    limparBloqueiosEndereco();
    limparCacheCoordenadaCliente();

    if (avisoEntrega) {
      avisoEntrega.innerText = 'Retirada no local sem taxa de entrega.';
    }

    fecharCarrinho();
    fecharOpcoesProduto();
    renderizarCarrinho();

    setTimeout(() => {
      abrirWhatsapp(urlWhatsapp);
    }, 150);
  } catch (erro) {
    alert('Erro ao salvar o pedido. Verifique a configuração do Supabase.');
    console.error(erro);
  } finally {
    if (btnFinalizar) {
      btnFinalizar.innerText = 'Finalizar no WhatsApp';
      btnFinalizar.disabled = !(await lojaAbertaAgora());
    }
  }
}

window.onclick = function (event) {
  const modalCarrinho = document.getElementById('modalCarrinho');
  const modalOpcoes = document.getElementById('modalOpcoesProduto');

  if (event.target === modalCarrinho) {
    fecharCarrinho();
  }

  if (event.target === modalOpcoes) {
    fecharOpcoesProduto();
  }
};

async function iniciarSistema() {
  await carregarConfiguracaoLoja();
  await carregarRegrasEntrega();
  aplicarMascaraCep();
  aplicarEventosEntrega();
  atualizarContadores();
  atualizarEntrega();
  limparBloqueiosEndereco();
  await atualizarStatusLoja();

  setInterval(async () => {
    await atualizarStatusLoja();
  }, 5000);

  console.log('Sistema iniciado com OpenStreetMap + OSRM + geocodificação reforçada.');
}

iniciarSistema();

function abrirAdicionalParaLanche(nomeAdicional, precoAdicional) {
  const lanches = carrinho
    .map((item, index) => ({ ...item, indexOriginal: index }))
    .filter(item => {
      const nome = String(item.nome || '').toLowerCase();

      return !nome.includes('coca') &&
        !nome.includes('sprite') &&
        !nome.includes('fanta') &&
        !nome.includes('guaraná') &&
        !nome.includes('guarana');
    });

  if (lanches.length === 0) {
    alert('Escolha um lanche primeiro para adicionar este item.');
    return;
  }

  adicionalPendente = {
    nome: nomeAdicional,
    preco: Number(precoAdicional || 0)
  };

  produtoOpcoesAtual = null;

  const modal = document.getElementById('modalOpcoesProduto');
  const titulo = document.getElementById('tituloOpcoesProduto');
  const descricao = document.getElementById('descricaoOpcoesProduto');
  const lista = document.getElementById('listaOpcoesProduto');

  if (!modal || !titulo || !descricao || !lista) return;

  titulo.innerText = 'Adicionar ' + nomeAdicional;
  descricao.innerText = 'Escolha em qual lanche será adicionado:';

  lista.innerHTML = lanches.map(item => `
    <label style="display:flex; align-items:center; gap:10px; padding:12px; border:1px solid rgba(255,255,255,0.12); border-radius:12px; cursor:pointer;">
      <input type="radio" name="lancheAdicional" value="${item.indexOriginal}">
      <span>${escaparHtml(item.nome)}</span>
    </label>
  `).join('');

  modal.style.display = 'flex';
  modal.classList.add('ativo');
}
