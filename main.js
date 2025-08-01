const preview = document.getElementById('progress');
const output = document.getElementById('result');
const button = document.getElementById('capture');
const langsel = document.getElementById('langsel');
const page_index = document.getElementById('capturar');
const page_translator = document.getElementById('traducir');
const translator_input = document.getElementById('source-text');
const translator_output = document.getElementById('translated-text');
const input_sel = document.getElementById("target-lang");
const source_sel = document.getElementById("source-lang");
let selectedLanguage = null;
let targetLanguage = null;
let worker = null;
let imagen = null;
let translator = null;


async function createWorker(logger = (m) => {console.log(m);}) {
	if (worker){
		worker.terminate();
		worker = null
  }
    
	worker = await Tesseract.createWorker(selectedLanguage, 1, {
		workerPath: "tesseract/worker.min.js",
		corePath: "tesseract/",
		langPath: "tesseract/lang-data/",
    workerBlobURL: false,
		logger: logger
	});
}




button.addEventListener('click', function() {
  chrome.tabs.captureVisibleTab(null, { format: "png" }, async function(dataUrl) {
      async function getCurrentTab() {
        let queryOptions = { active: true, lastFocusedWindow: true };
        let [tab] = await chrome.tabs.query(queryOptions);
        return tab;
      }
    
    async function openUniqueExtensionTab(filename) {
      const extensionUrl = chrome.runtime.getURL(filename);
      const [existingTab] = await chrome.tabs.query({url: extensionUrl});
      const currentTab = await getCurrentTab();

      if (currentTab.url === extensionUrl)
        return false;

      const newTab = await chrome.tabs.create({
        url: extensionUrl, 
        index: currentTab.index,  
        active: true
      });

      //cerrar la pestaña que hubiese antes abierta
      if (existingTab)
        await chrome.tabs.remove(existingTab.id);

      await chrome.windows.update(newTab.windowId, {
        focused: true
      });
      
      return true;
    }

    const current_window = await chrome.windows.getLastFocused();

    const saved_data = { screenCapture: dataUrl, focus: current_window.incognito? current_window.id:null };
    await chrome.storage.session.set(saved_data);
    
    if(await openUniqueExtensionTab("capture.html"))
      window.close();
    else
      chrome.runtime.sendMessage({
        action: "alert",
        data: chrome.i18n.getMessage("captureInstructions")
      });
      
  });
});



const LANGUAGES = {
  ara: "ar",
  rus: "ru",
  hin: "hi",
	"chi_sim" : "zh-Hans",
	"chi_tra": "zh-Hant",
  kor: "ko",
  jpn: "ja",
  spa: "es",
  eng: "en",
  deu:"de",
	fra: "fr",
	ita: "it",
	por: "pt",
};
function addLangSelector(domsel, selection, fun, disabled = []){ //disabled y selection deben estar en el formato OCR
  Object.keys(LANGUAGES).forEach(function (key) {
		let elem = document.createElement("option");
		elem.value = key;
    elem.textContent = new Intl.DisplayNames([chrome.i18n.getUILanguage()], {type:'language'}).of(LANGUAGES[key]);
    elem.disabled = disabled.includes(key); 
		domsel.appendChild(elem);
  });
  
  domsel.value = selection;
  domsel.addEventListener("change", fun);
}
async function eventMainSelector(){
  langsel.disabled = true;
  selectedLanguage = langsel.value;

  await chrome.storage.session.set({ lang: selectedLanguage });

  if(imagen){
    await createWorker();
    await updateText();
  }
  langsel.disabled = false;
}
async function eventTranslatorSelector(){
  input_sel.disabled = true;
  targetLanguage = input_sel.value;
  
  await createTranslator();
  await updateTranslation();
  input_sel.disabled = false;
}



async function processImage(){
    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }
    const img = await loadImage(imagen);
    const canvas = new OffscreenCanvas(100, 100);

    const umbral_coloreado = 200;
    const umbral_simple = 120;
    
    // Crear canvas del tamaño de la imagen
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imageData.data;
    
    let eres_negro = 0;
    for (let i = 0; i < data.length; i += 4) {
      let gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      data[i] = data[i+1] = data[i+2] = gray;
      eres_negro += gray>umbral_simple? -1:1;
    }
    eres_negro = eres_negro > 0;
    let data_copy = [...data]
    
    for (let i = 0; i < data.length; i += 4) {
      if (eres_negro)
        data[i] = data[i] > umbral_coloreado ? 0 : 255;
      else
        data[i] = data[i] > umbral_coloreado ? 255 : 0;
      data[i+1] = data[i];
      data[i+2] = data[i];
    }

    //Flood fill
    const width = canvas.width;
    const height = canvas.height;
    // Función para obtener el índice del píxel
    const getPixelIndex = (x, y) => (y * width + x) * 4;
    // Función para verificar si un píxel es negro (fondo)
    const isBlack = (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      const index = getPixelIndex(x, y);
      const gray = data[index]; // Asumiendo que ya está en escala de grises
      return gray < 128; // Considera negro si es menor a 128
    };
    // Función para marcar un píxel como visitado (pintarlo de blanco)
    const markAsBackground = (x, y) => {
      const index = getPixelIndex(x, y);
      data[index] = 255;     // R
      data[index + 1] = 255; // G  
      data[index + 2] = 255; // B
    };

    const floodFill = (startX, startY) => {
      const stack = [[startX, startY]];
      const visited = new Set();
      
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = `${x},${y}`;
        
        if (visited.has(key) || !isBlack(x, y)) continue;
        
        visited.add(key);
        markAsBackground(x, y);
        
        // Añadir píxeles vecinos (4-conectividad)
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }
    };
    // Empezar flood fill desde todos los bordes
    for (let x = 0; x < width; x++) {
      if (isBlack(x, 0)) floodFill(x, 0);           // Borde superior
      if (isBlack(x, height - 1)) floodFill(x, height - 1); // Borde inferior
    }
    for (let y = 0; y < height; y++) {
      if (isBlack(0, y)) floodFill(0, y);           // Borde izquierdo
      if (isBlack(width - 1, y)) floodFill(width - 1, y); // Borde derecho
    }

    //Añadir los datos del procesado simple
    for (let i = 0; i < data_copy.length; i += 4) {
      if (eres_negro)
        data[i] = data_copy[i] > umbral_simple ? 0:data[i];
      else
        data[i] = data_copy[i] > umbral_simple ? data[i]:0;
      data[i+1] = data[i];
      data[i+2] = data[i];
    }
    
    ctx.putImageData(imageData, 0, 0);

    // Usar el canvas procesado como entrada para Tesseract
    let { data:result } = await worker.recognize(canvas);
    return result;
}

function processTextFromResult(result){
  return result.text; // TODO: hacer selección de palabras según confianza
}

async function updateText(){
  const ocr_text = processTextFromResult(await processImage())
  output.textContent = ocr_text;
}

document.addEventListener('DOMContentLoaded', async function() {
  // Primero, cargar las traducciones
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const msg = el.getAttribute('data-i18n-placeholder');
    el.placeholder = chrome.i18n.getMessage(msg);
  });
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = el.getAttribute('data-i18n');
    el.textContent = chrome.i18n.getMessage(msg);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const msg = el.getAttribute('data-i18n-title');
    el.title = chrome.i18n.getMessage(msg);
  });

  const result = await chrome.storage.session.get(['lang']);
  selectedLanguage = result.lang || "jpn";
  addLangSelector(langsel, selectedLanguage, eventMainSelector);
  if ("Translator" in window){
    const transl_button = document.getElementById("translate-button");
    transl_button.style.display = "";

    transl_button.addEventListener('click', () => {
      page_index.style.display = "none";
      page_translator.style.display = "";
      let popup;
      if (popup = document.getElementById('copied-popup'))
        popup.remove();


      addLangSelector(input_sel, selectedLanguage=="eng"?"spa":"eng", eventTranslatorSelector, [selectedLanguage]);
      let elem = document.createElement("option");
      elem.textContent = new Intl.DisplayNames([chrome.i18n.getUILanguage()], {type:'language'}).of(LANGUAGES[selectedLanguage]);
      source_sel.appendChild(elem);

      translator_input.textContent = output.textContent;
      let timer;
      translator_input.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          await updateTranslation();
        }, 1000);
      });

      const copy_translation_output = document.getElementById('clipboard-translation-button');
      copy_translation_output.addEventListener('click', async ()=>{
        await navigator.clipboard.writeText(translator_output.textContent);
        showCopiedPopup();
      })
      eventTranslatorSelector();
    })
  }

  const clipboard_button = document.getElementById("clipboard-button");
  clipboard_button.addEventListener('click', async ()=>{
    await navigator.clipboard.writeText(output.textContent);
    showCopiedPopup();

  })

  await createWorker();
  imagen = (await chrome.storage.session.get(['OCRImage'])).OCRImage;
  if (imagen){
    preview.src = imagen;
    await updateText();
  }
});



async function createTranslator() {
  if (translator){
		translator.destroy();
		translator = null
  }
    
	translator = await Translator.create({
		sourceLanguage: LANGUAGES[selectedLanguage],
    targetLanguage: LANGUAGES[targetLanguage]
	});
}

async function updateTranslation(){
  translator_output.textContent = await translator.translate(translator_input.value);
}


function showCopiedPopup() {
  if (document.getElementById('copied-popup')) return;

  const popup = document.createElement('div');
  popup.id = 'copied-popup';
  popup.textContent = 'Copied';

  popup.style.position = 'fixed';
  popup.style.left = '25%';
  popup.style.bottom = '5px';
  popup.style.transform = 'translateX(-85%)';
  popup.style.background = '#323232';
  popup.style.color = '#fff';
  popup.style.padding = '8px 18px';
  popup.style.borderRadius = '18px';
  popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  popup.style.fontSize = '16px';
  popup.style.fontFamily = 'Roboto, Arial, sans-serif';
  popup.style.opacity = '0';
  popup.style.transition = 'opacity 0.3s, bottom 0.3s';
  popup.style.zIndex = '9999';

  document.body.appendChild(popup);

  // Forzar reflow para animar
  void popup.offsetWidth;
  popup.style.opacity = '1';
  popup.style.bottom = '17px';

  // Ocultar y eliminar el popup después de 1.5 segundos
  setTimeout(() => {
    popup.style.opacity = '0';
    popup.style.bottom = '32px';
    setTimeout(() => {
      popup.remove();
    }, 300);
  }, 1500);
}