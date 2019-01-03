import 'babel-polyfill';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.js'
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
const renderBtn = document.getElementById("render");
const input = document.querySelector("input[type='file']");
const canvas = document.getElementById("pdfCanvas");
const boxCanvas = document.getElementById("boxCanvas");
const boxCtx = boxCanvas.getContext('2d');
const ctx = canvas.getContext("2d");
let scale = 1.5;
let currentPage = 1;
let navBtnsDrawn = false;
let boundingBoxes = {};
let pdf, xMax, yMax, page, file, numPages, mousePosition, scaling, rectCoords, rectSave;

renderBtn.onclick = function (event) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        file = e.target.result;
        currentPage = 1;
        loadPDF(file, currentPage);
        if (navBtnsDrawn) return;
        drawPageNavBtns();
        const ctrlBtns = document.querySelectorAll('.btnGrp');
        ctrlBtns.forEach(btnGrp => btnGrp.style.display = "flex");
        canvas.style.display = "block";
        boxCanvas.style.display = "block";
        navBtnsDrawn = true;
    }
    reader.readAsDataURL(input.files[0]);
}

async function loadPDF(pdfFile, pageNum) {
    pdf = await pdfjsLib.getDocument(pdfFile);
    numPages = pdf.numPages;
    for (let i = 0; i < numPages; i++) {
        boundingBoxes[`page${i + 1}`] = [];
    }
    await getPage(pageNum);
    renderPage(page);
    updatePageNumDisplay();
}

async function getPage(pageNum) {
    page = await pdf.getPage(pageNum);
}

function renderPage(page) {
    const viewport = page.getViewport(scale);
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    boxCanvas.height = viewport.height;
    boxCanvas.width = viewport.width;
    yMax = Math.floor((viewport.height / scale) * 4.1667);
    xMax = Math.floor((viewport.width / scale) * 4.1667);
    const renderContext = {
        canvasContext: ctx,
        viewport: viewport
    }
    page.render(renderContext);
    drawBoundingBoxes();
}

boxCanvas.onmousemove = function (e) {
    const scaleFactor = round((4.1666667 / scale), 6);
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const cvsX = e.clientX - Math.floor(rect.left);
    const cvsY = e.clientY - Math.floor(rect.top);
    let x = Math.floor((e.clientX - rect.left) * scaleFactor);
    let y = Math.floor((e.clientY - rect.top) * scaleFactor);
    if (x > xMax) x = xMax;
    if (y > yMax) y = yMax;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    mousePosition = { clientX, clientY, cvsX, cvsY, x, y, scaleFactor };
    // console.log({mousePosition});
}

function drawPageNavBtns() {
    const navBtnsDiv = document.getElementById('navBtns');
    const nextBtn = drawBtn("Next Page", nextPage);
    const prevBtn = drawBtn("Prev Page", prevPage);
    navBtnsDiv.appendChild(prevBtn);
    navBtnsDiv.appendChild(nextBtn);
}

function drawBtn(btnText, Fn) {
    const btn = document.createElement('button');
    btn.classList = "btn waves-effect waves-light blue"
    btn.textContent = btnText;
    btn.onclick = Fn;
    return btn;
}

async function nextPage() {
    if (currentPage < numPages) {
        currentPage++;
        await getPage(currentPage);
        renderPage(page);
        updatePageNumDisplay();
    }
}

async function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        await getPage(currentPage);
        renderPage(page);
        updatePageNumDisplay();
    }
}

function updatePageNumDisplay() {
    const div = document.getElementById("pageNumDisplay");
    div.textContent = `${currentPage}/${numPages}`;
}

function round(value, places) {
    return Number(Math.round(value + 'e' + places) + 'e-' + places);
}

function zoom(newScale) {
    if (scaling || scale === newScale) return;
    scaling = true;
    scale = newScale;
    renderPage(page);
    setTimeout(() => scaling = false, 500);
}

function zoomIn() {
    let newScale = scale + 0.25;
    if (newScale > 5) return;
    zoom(newScale);
}

function zoomOut() {
    let newScale = scale - 0.25;
    if (newScale < 0.5) return;
    zoom(newScale);
}

boxCanvas.onmousedown = function (event) {
    rectCoords = {
        originX: mousePosition.cvsX,
        originY: mousePosition.cvsY,
        scaledX1: mousePosition.x,
        scaledY1: mousePosition.y

    }
    animateRects();
}

boxCanvas.onmouseup = function () {
    const boundingBox = new BoundingBox(...rectSave, mousePosition.cvsX, mousePosition.cvsY, scale, rectCoords.scaledX1, rectCoords.scaledY1, mousePosition.x, mousePosition.y);
    rectCoords = undefined;
    if (Math.abs(rectSave[2]) > 10 && Math.abs(rectSave[3]) > 10) {
        boundingBoxes[`page${currentPage}`].push(boundingBox);
    }
    drawBoundingBoxes();
}

function animateRects() {
    if (!rectCoords) return;
    drawBoundingBoxes();
    boxCtx.beginPath();
    boxCtx.strokeStyle = 'crimson';
    rectSave = [rectCoords.originX, rectCoords.originY, mousePosition.cvsX - rectCoords.originX, mousePosition.cvsY - rectCoords.originY];
    boxCtx.rect(...rectSave);
    boxCtx.stroke();
    requestAnimationFrame(animateRects);
}

function drawBoundingBoxes() {
    boxCtx.clearRect(0, 0, boxCanvas.width, boxCanvas.height);
    if (boundingBoxes[`page${currentPage}`]) {
        boundingBoxes[`page${currentPage}`].forEach(box => box.update());
    }
}

function BoundingBox(x1, y1, width, height, x2, y2, scaleAtCreation, sx1, sy1, sx2, sy2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.width = width;
    this.height = height;
    this.scale = scaleAtCreation;
    this.scaledX1 = sx1;
    this.scaledY1 = sy1;
    this.scaledX2 = sx2;
    this.scaledY2 = sy2;
}

BoundingBox.prototype.update = function () {
    boxCtx.beginPath();
    boxCtx.strokeStyle = 'dodgerblue';
    if (this.scale === scale) {
        boxCtx.rect(this.x1, this.y1, this.width, this.height);
    } else {
        boxCtx.rect((this.x1 / this.scale) * scale,
            (this.y1 / this.scale) * scale,
            (this.width / this.scale) * scale,
            (this.height / this.scale) * scale);
    }
    boxCtx.stroke();
}

function clearLastBox() {
    const pageArr = boundingBoxes[`page${currentPage}`];
    if (pageArr && pageArr.length > 0) {
        pageArr.pop();
        drawBoundingBoxes();
    }
}

function clearAllBoxes() {
    let pageArr = boundingBoxes[`page${currentPage}`];
    if (pageArr && pageArr.length > 0) {
        boundingBoxes[`page${currentPage}`] = [];
        drawBoundingBoxes();
    }
}

document.getElementById("undo").onclick = clearLastBox;
document.getElementById("clearAll").onclick = clearAllBoxes;
document.getElementById("zoomin").onclick = zoomIn;
document.getElementById("reset").onclick = () => zoom(1.5);
document.getElementById("zoomout").onclick = zoomOut;