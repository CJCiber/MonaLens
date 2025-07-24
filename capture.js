let isSelecting = false;
let isExiting = false;
let startX, startY, endX, endY;
let selectionDiv = null;
const imageElement = document.getElementById("captura");
const imgDiv = document.getElementById("img-div");
const cursor_exit = "url('images/exit_to_app.svg') 2 2, auto";


function handleMouseDown(e) {
    e.preventDefault();
    if (isSelecting || isExiting)
        return;
    if (e.target !== imageElement){
        if(e.button !== 0)
            return;

        isExiting = true;

        imageElement.style.cursor = "not-allowed";
        document.addEventListener('mouseup', finishClickOutside);
    }else{
        startSelection(e); //isSelecting = true
        document.body.style.cursor = "crosshair";
        document.addEventListener('mousemove', updateSelection);
        document.addEventListener('mouseup', endSelection);
    }
}

function startSelection(e) {
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
    const rect = imageElement.getBoundingClientRect();
    endX = e.clientX - rect.left;
    endY = e.clientY - rect.top;
    endX = Math.min(Math.max(0,endX), rect.width);
    endY = Math.min(Math.max(0,endY), rect.height);
    
    const width = Math.min(Math.abs(endX - startX));
    const height = Math.abs(endY - startY);
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    
    selectionDiv.style.left = left + 'px';
    selectionDiv.style.top = top + 'px';
    selectionDiv.style.width = width + 'px';
    selectionDiv.style.height = height + 'px';
}

async function closeCurrentTab(){
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.tabs.remove(tab.id);
}
function abortSelection() {
    isSelecting = false;
    if (selectionDiv)
        selectionDiv.remove();
    selectionDiv = null;
    startX = startY = endX = endY = null;
    document.body.style.cursor = cursor_exit;
    document.removeEventListener('mousemove',updateSelection);
    document.removeEventListener('mouseup', endSelection);
}

async function endSelection(e) {
    if (e.buttons !== 0)
        return;

    if (endX == null) // caso que no se llamó al updateSelection
        await closeCurrentTab();

    const sel_width = Math.abs(endX - startX);
    const sel_height = Math.abs(endY - startY);
    const min_pixels = 2;
    if (sel_width <= min_pixels){
        if(sel_height <= min_pixels)
            await closeCurrentTab(); // dar un margen para cerrar
        abortSelection();
        return;
    }
    if (sel_height <= min_pixels){
        abortSelection();
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
    await closeCurrentTab();
}

async function finishClickOutside(e) {
    if (e.button !== 0)
        return;
    if (e.target !== imageElement)
        await closeCurrentTab();
    
    isExiting = false;

    imageElement.style.cursor = "crosshair";
    document.removeEventListener('mouseup', finishClickOutside);
}

function handleMessage(request, sender, sendResponse) {
 if (request.action === "alert")
    alert(request.data);
}


// Init
(async () => {
    const result = await chrome.storage.session.get(['screenCapture']);
    imageElement.src = result.screenCapture;

    document.addEventListener('mousedown', handleMouseDown);
})();
document.addEventListener('contextmenu', function(event) { event.preventDefault();}); //Deshabilitar context menu
chrome.runtime.onMessage.addListener(handleMessage);
window.addEventListener('resize', () => {
    if (isSelecting)
        abortSelection();
});