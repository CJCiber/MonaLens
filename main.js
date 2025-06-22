let worker = null

async function createWorker(lang = "jpn", logger = (m) => {console.log(m);}) {
	if (worker)
		worker.terminate();
		worker = null
	worker = await Tesseract.createWorker(lang, 1, {
		workerPath: "tesseract/worker.min.js",
		corePath: "tesseract/",
		langPath: "tesseract/lang-data/",
    	workerBlobURL: false,
		logger: logger
	});
	return worker;
}


const imageInput = document.getElementById('fileInput');
const preview = document.getElementById('progress');
const output = document.getElementById('result');

imageInput.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file) return;

      const img = new Image();
      img.onload = async function () {
        const umbral_coloreado = 200;
        const umbral_simple = 120;
        
        // Crear canvas del tamaño de la imagen
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Procesar la imagen: escala de grises y binarización
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

        // Flood fill iterativo
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

        // Borde superior e inferior
        for (let x = 0; x < width; x++) {
          if (isBlack(x, 0)) floodFill(x, 0);           // Borde superior
          if (isBlack(x, height - 1)) floodFill(x, height - 1); // Borde inferior
        }

        // Borde izquierdo y derecho
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


        //preview.innerHTML = `<img src="${canvas.toDataURL()}" width="200">`;

        // Usar el canvas procesado como entrada para Tesseract
        const worker = await createWorker();
        const { data: { text } } = await worker.recognize(canvas);
            output.textContent = text;
        };
      img.src = URL.createObjectURL(file);
    });