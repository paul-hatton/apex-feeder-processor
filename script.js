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
const instructionBox    = document.querySelector('.instruction-box');
const instructionHeader = document.querySelector('.instruction-header');
const toggleBtn         = document.querySelector('.toggle-btn');
const uploadPlaceholder = document.querySelector('.upload-placeholder');

let selectedFile = null;
let filteredPdfUrl = null;

// Initialize UI
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the collapsible instructions
  instructionHeader.addEventListener('click', toggleInstructions);
  
  // Set up the file drop zone
  setupFileDragAndDrop();
});

// Event listeners
fileUpload.addEventListener('change', handleFileSelection);
processButton.addEventListener('click', processPDF);
resetButton.addEventListener('click', resetForm);

// Toggle instructions visibility
function toggleInstructions() {
  instructionBox.classList.toggle('collapsed');
  // Store preference in localStorage
  const isCollapsed = instructionBox.classList.contains('collapsed');
  localStorage.setItem('instructionsCollapsed', isCollapsed);
}

// Load saved preference for instructions visibility
function loadSavedPreferences() {
  const isCollapsed = localStorage.getItem('instructionsCollapsed') === 'true';
  if (isCollapsed) {
    instructionBox.classList.add('collapsed');
  }
}

// Set up file drag and drop
function setupFileDragAndDrop() {
  const dropZone = document.querySelector('.file-upload-container');
  
  // Prevent default behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });
  
  // Highlight drop zone when file is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
  });
  
  // Handle dropped files
  dropZone.addEventListener('drop', handleDrop, false);
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  function highlight() {
    dropZone.style.borderColor = '#4285f4';
    dropZone.style.backgroundColor = 'rgba(66, 133, 244, 0.1)';
  }
  
  function unhighlight() {
    dropZone.style.borderColor = '#ddd';
    dropZone.style.backgroundColor = '';
  }
  
  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0) {
      fileUpload.files = files;
      handleFileSelection({target: {files: files}});
    }
  }
}

function handleFileSelection(e) {
  const file = e.target.files[0];
  
  if (file && file.type === 'application/pdf') {
    selectedFile = file;
    fileInfo.innerHTML = `<i class="fas fa-check-circle"></i> Selected: ${file.name}`;
    processButton.disabled = false;
    hideStatusMessage();
    
    // Update upload placeholder
    uploadPlaceholder.innerHTML = `
      <i class="fas fa-file-pdf"></i>
      <span>${file.name}</span>
    `;
  } else if (file) {
    showStatusMessage('Please select a valid PDF file.', 'error');
    resetFileInput();
  }
}

function resetFileInput() {
  fileUpload.value = '';
  fileInfo.textContent = '';
  selectedFile = null;
  processButton.disabled = true;
  
  // Reset upload placeholder
  uploadPlaceholder.innerHTML = `
    <i class="fas fa-cloud-upload-alt"></i>
    <span>Drag & drop or click to browse</span>
  `;
}

function showStatusMessage(message, type = 'info') {
  statusMessage.innerHTML = `<i class="fas ${getIconForMessageType(type)}"></i> ${message}`;
  statusMessage.className = `status-message ${type}-message`;
  statusMessage.classList.remove('hidden');
  
  // Auto hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      hideStatusMessage();
    }, 5000);
  }
}

function getIconForMessageType(type) {
  switch (type) {
    case 'success': return 'fa-check-circle';
    case 'error': return 'fa-exclamation-circle';
    default: return 'fa-info-circle';
  }
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
      const hasOrchestra  = pageText.includes('ORCHESTRA') || pageText.includes('ORCHEST');

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
      summary = `<i class="fas fa-users"></i> Found approximately ${studentEstimate} students currently in band or orchestra.
        <ul>
          <li>${bandCount} student page(s) with "BAND" in their schedule</li>
          <li>${orchestraCount} student page(s) with "ORCHESTRA" in their schedule</li>
        </ul>`;
    } else if (filterOption === 'band') {
      summary = `<i class="fas fa-users"></i> Found approximately ${bandCount} students currently in band.`;
    } else {
      summary = `<i class="fas fa-users"></i> Found approximately ${orchestraCount} students currently in orchestra.`;
    }

    summaryMessage.innerHTML = summary;

    // Create download link
    downloadReport.href = newPdfUrl;
    downloadReport.download = 'band_orchestra_students.pdf';

    // Show final UI
    progressContainer.classList.add('hidden');
    uploadForm.classList.add('hidden');
    resultContainer.classList.remove('hidden');
    
    // Add animation to the result container
    resultContainer.style.animation = 'fadeIn 0.5s ease';
    
    pdfPreview.src = newPdfUrl;
    filteredPdfUrl = newPdfUrl;
    
    // Show success message
    showStatusMessage('PDF successfully processed!', 'success');

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
  
  // Reset upload placeholder
  uploadPlaceholder.innerHTML = `
    <i class="fas fa-cloud-upload-alt"></i>
    <span>Drag & drop or click to browse</span>
  `;

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

// Initialize on load
loadSavedPreferences();
