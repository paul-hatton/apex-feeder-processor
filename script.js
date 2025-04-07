// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// DOM elements
const fileUpload        = document.getElementById('file-upload');
const fileInfo          = document.getElementById('file-info');
const filterType        = document.getElementById('filter-type');
const processButton     = document.getElementById('process-button');
const progressContainer = document.getElementById('progress-container');
const progressText      = document.getElementById('progress-text');
const progressFill      = document.getElementById('progress-fill');
const statusMessage     = document.getElementById('status-message');
const resultContainer   = document.getElementById('result-container');
const summaryMessage    = document.getElementById('summary-message');
const downloadReport    = document.getElementById('download-report');
const pdfPreview        = document.getElementById('pdf-preview');
const resetButton       = document.getElementById('reset-button');
const uploadForm        = document.getElementById('upload-form');

let selectedFile = null;
let filteredPdfUrl = null;

// Event listeners
fileUpload.addEventListener('change', handleFileSelection);
processButton.addEventListener('click', processPDF);
resetButton.addEventListener('click', resetForm);

function handleFileSelection(e) {
  const file = e.target.files[0];
  if (file && file.type === 'application/pdf') {
    selectedFile = file;
    fileInfo.textContent = `Selected file: ${file.name}`;
    processButton.disabled = false;
    hideStatusMessage();
  } else {
    showStatusMessage('Please select a valid PDF file.', 'error');
    resetFileInput();
  }
}

function resetFileInput() {
  fileUpload.value = '';
  fileInfo.textContent = '';
  selectedFile = null;
  processButton.disabled = true;
}

function showStatusMessage(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}-message`;
  statusMessage.classList.remove('hidden');
}

function hideStatusMessage() {
  statusMessage.classList.add('hidden');
}

function setProgress(value) {
  progressFill.style.width = value + '%';
}

function updateProgressText(text) {
  progressText.textContent = text;
}

async function processPDF() {
  if (!selectedFile) return;

  // Prepare UI
  processButton.disabled = true;
  progressContainer.classList.remove('hidden');
  hideStatusMessage();
  setProgress(0);
  updateProgressText('Reading file...');

  try {
    const filterOption = filterType.value; // "both", "band", "orchestra"
    const fileData     = await readFileAsUint8Array(selectedFile);

    // Load with PDF.js to extract text
    const pdfJsDoc  = await pdfjsLib.getDocument(fileData).promise;
    const totalPages = pdfJsDoc.numPages;

    // Also load with pdf-lib to copy pages
    const originalPdfLibDoc = await PDFLib.PDFDocument.load(fileData);
    const newPdfDoc         = await PDFLib.PDFDocument.create();

    // Keep track of how many pages matched each term
    let bandCount = 0;
    let orchestraCount = 0;

    for (let i = 1; i <= totalPages; i++) {
      setProgress(Math.floor((i / totalPages) * 100));
      updateProgressText(`Scanning page ${i} of ${totalPages}...`);

      const page     = await pdfJsDoc.getPage(i);
      const textCont = await page.getTextContent();
      const pageText = textCont.items.map(item => item.str.toUpperCase()).join(' ');

      const hasBand       = pageText.includes('BAND');
      const hasOrchestra  = pageText.includes('ORCHESTRA');

      // Decide if we keep this page based on filter
      let keepPage = false;
      if (filterOption === 'both') {
        keepPage = hasBand || hasOrchestra;
      } else if (filterOption === 'band') {
        keepPage = hasBand;
      } else if (filterOption === 'orchestra') {
        keepPage = hasOrchestra;
      }

      if (keepPage) {
        const [copiedPage] = await newPdfDoc.copyPages(originalPdfLibDoc, [i - 1]);
        newPdfDoc.addPage(copiedPage);

        if (hasBand) bandCount++;
        if (hasOrchestra) orchestraCount++;
      }
    }

    // If no pages matched, show message
    if (newPdfDoc.getPageCount() === 0) {
      progressContainer.classList.add('hidden');
      showStatusMessage('No students found with band or orchestra in their schedule.', 'error');
      processButton.disabled = false;
      return;
    }

    updateProgressText('Creating student list...');
    const newPdfBytes = await newPdfDoc.save();
    const newPdfBlob  = new Blob([newPdfBytes], { type: 'application/pdf' });
    const newPdfUrl   = URL.createObjectURL(newPdfBlob);

    // Show a brief summary with student count estimate
    let summary = '';
    let studentEstimate = Math.max(bandCount, orchestraCount);
    
    if (filterOption === 'both') {
      summary = `Found approximately ${studentEstimate} students currently in band or orchestra.
        - ${bandCount} student page(s) with "BAND" in their schedule
        - ${orchestraCount} student page(s) with "ORCHESTRA" in their schedule`;
    } else if (filterOption === 'band') {
      summary = `Found approximately ${bandCount} students currently in band.`;
    } else {
      summary = `Found approximately ${orchestraCount} students currently in orchestra.`;
    }

    summaryMessage.textContent = summary;

    // Initiate automatic download
    downloadReport.href = newPdfUrl;
    downloadReport.download = 'band_orchestra_students.pdf';
    downloadReport.click(); // auto-download

    // Show final UI
    progressContainer.classList.add('hidden');
    uploadForm.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    pdfPreview.src = newPdfUrl;
    filteredPdfUrl = newPdfUrl;

  } catch (err) {
    console.error(err);
    showStatusMessage('Error processing PDF: ' + err.message, 'error');
    processButton.disabled = false;
    progressContainer.classList.add('hidden');
  }
}

function resetForm() {
  fileUpload.value = '';
  fileInfo.textContent = '';
  processButton.disabled = true;
  progressContainer.classList.add('hidden');
  resultContainer.classList.add('hidden');
  uploadForm.classList.remove('hidden');
  hideStatusMessage();
  selectedFile = null;
  setProgress(0);
  updateProgressText('Processing PDF...');
  pdfPreview.src = '';

  if (filteredPdfUrl) {
    URL.revokeObjectURL(filteredPdfUrl);
    filteredPdfUrl = null;
  }
}

function readFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(new Uint8Array(e.target.result));
    reader.onerror = err => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
