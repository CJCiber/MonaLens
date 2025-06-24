const preview = document.getElementById('progress');
const output = document.getElementById('result');
const button = document.getElementById('capture');
const langsel = document.getElementById('langsel');
let selectedLanguage = null;
let worker = null;
let imagen = null;

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


button.addEventListener('click', async function() {
  chrome.tabs.captureVisibleTab(null, { format: "png" }, async function(dataUrl) {
    
    async function openUniqueExtensionTab(filename) {
      async function getCurrentTab() {
        let queryOptions = { active: true, lastFocusedWindow: true };
        let [tab] = await chrome.tabs.query(queryOptions);
        return tab;
      }
      const extensionUrl = chrome.runtime.getURL(filename);

      const [existingTab] = await chrome.tabs.query({url: extensionUrl});
      if (existingTab)
        await chrome.tabs.remove(existingTab.id);


      const currentTab = await getCurrentTab();    
        
      await chrome.tabs.create({
        url: extensionUrl, 
        index: currentTab.index,  
        active: true 
      });

    }
    await chrome.storage.session.set({ screenCapture: dataUrl });
    
    await openUniqueExtensionTab("capture.html")
  });
});



let LANGUAGES = {
	Arabic: "ara",
	"Chinese - Simplified": "chi_sim",
	"Chinese - Traditional": "chi_tra",
	German: "deu",
	English: "eng",
	French: "fra",
	Hindi: "hin",
	Italian: "ita",
	Japanese: "jpn",
	Korean: "kor",
	Portuguese: "por",
	Russian: "rus"
};
function addLangSelector(){
  Object.keys(LANGUAGES).forEach(function (key) {
		let elem = document.createElement("option");
		elem.value = LANGUAGES[key];
    elem.textContent = key;
		langsel.appendChild(elem);
  });
  
  langsel.value = selectedLanguage;
  langsel.addEventListener("change", async function () {
    selectedLanguage = langsel.value;
    await chrome.storage.session.set({ lang: selectedLanguage });
  });
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
    console.log(eres_negro)
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
    console.log("Iniciando flood fill desde los bordes...");
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
  output.textContent = processTextFromResult(await processImage());
}

document.addEventListener('DOMContentLoaded', async function() {
  const result = await chrome.storage.session.get(['lang']);
  selectedLanguage = result.lang || "jpn";
  console.log(result);
  addLangSelector();
  await createWorker();
  imagen = (await chrome.storage.session.get(['OCRImage'])).OCRImage;
  if (imagen){
    const img = document.createElement('img');
    img.src = imagen;
    img.style.width = "200";

    preview.appendChild(img);
    await updateText();
  }
});


