let isSelecting = false;
let startX, startY, endX, endY;
let selectionDiv = null;
let imageElement = null;

const imgDiv = document.getElementById("captura");
const resultado = document.getElementById("resultado");

(async () => {
    const result = await chrome.storage.session.get(['screenCapture']);
    
    // Crear imagen
    const img = document.createElement('img');
    img.src = result.screenCapture;
    img.style.maxWidth = "100%";
    img.style.userSelect = "none";
    img.draggable = false;
    
    imgDiv.innerHTML = "";
    imgDiv.appendChild(img);
    imageElement = img;
    
    // Eventos de selección
    img.addEventListener('mousedown', startSelection);
    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
})();

function startSelection(e) {
    e.preventDefault();
    isSelecting = true;
    
    const rect = imageElement.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    
    // Crear div de selección
    selectionDiv = document.createElement('div');
    selectionDiv.style.position = 'absolute';
    selectionDiv.style.border = '.5px dashed #007cba';
    selectionDiv.style.backgroundColor = 'rgba(0, 124, 186, 0.1)';
    selectionDiv.style.left = startX + 'px';
    selectionDiv.style.top = startY + 'px';
    selectionDiv.style.width = '0px';
    selectionDiv.style.height = '0px';
    selectionDiv.style.pointerEvents = 'none';
    
    imgDiv.appendChild(selectionDiv);
}

function updateSelection(e) {
    if (!isSelecting || !selectionDiv) return;
    
    const rect = imageElement.getBoundingClientRect();
    endX = e.clientX - rect.left;
    endY = e.clientY - rect.top;
    
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    
    selectionDiv.style.left = left + 'px';
    selectionDiv.style.top = top + 'px';
    selectionDiv.style.width = width + 'px';
    selectionDiv.style.height = height + 'px';
}

async function endSelection(e) {
    isSelecting = false;
    if (!selectionDiv) {
        alert('Primero selecciona un área de la imagen');
        return;
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Obtener coordenadas de la selección
    const rect = selectionDiv.getBoundingClientRect();
    const imgRect = imageElement.getBoundingClientRect();
    
    const scaleX = imageElement.naturalWidth / imageElement.width;
    const scaleY = imageElement.naturalHeight / imageElement.height;
    
    const cropX = (rect.left - imgRect.left) * scaleX;
    const cropY = (rect.top - imgRect.top) * scaleY;
    const cropWidth = rect.width * scaleX;
    const cropHeight = rect.height * scaleY;
    
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    
    // Dibujar la parte recortada
    ctx.drawImage(
        imageElement,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight
    );
    
    const croppedImageData = canvas.toDataURL('image/png');
    await chrome.storage.session.set({ OCRImage: croppedImageData });
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.tabs.remove(tab.id);
}