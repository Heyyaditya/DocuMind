
const fileInput = document.getElementById("fileInput");
const dropArea = document.getElementById("dropArea");
const fileList = document.getElementById("fileList");
const uploadBtn = document.getElementById("uploadBtn");

let selectedFiles = [];

const allowedExtensions = ["pdf", "docx", "txt"];

// Format file size
function formatSize(bytes) {
    return (bytes / 1024).toFixed(2) + " KB";
}

// Validate and add files
function addFiles(files) {

    Array.from(files).forEach(file => {

        const extension = file.name.split(".").pop().toLowerCase();

        if (!allowedExtensions.includes(extension)) {
            alert(`${file.name} is not supported.`);
            return;
        }

        const alreadyExists = selectedFiles.some(
            existing => existing.name === file.name &&
                        existing.size === file.size
        );

        if (!alreadyExists) {
            selectedFiles.push(file);
        }
    });

    displayFiles();
}

// Display selected files
function displayFiles() {

    fileList.innerHTML = "";

    if (selectedFiles.length === 0) {

        fileList.innerHTML =
            '<li class="empty-message">No files selected yet</li>';

        uploadBtn.disabled = true;
        return;
    }

    selectedFiles.forEach((file, index) => {

        const li = document.createElement("li");

        const details = document.createElement("div");
        details.className = "file-details";

        const name = document.createElement("span");
        name.className = "file-name";
        name.textContent = file.name;

        const size = document.createElement("span");
        size.className = "file-size";
        size.textContent = formatSize(file.size);

        details.append(name, size);

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "✕";
        removeBtn.type = "button";

        removeBtn.addEventListener("click", () => {

            selectedFiles.splice(index, 1);
            displayFiles();

        });

        li.append(details, removeBtn);
        fileList.appendChild(li);

    });

    uploadBtn.disabled = false;
}

// Browse files
fileInput.addEventListener("change", () => {

    addFiles(fileInput.files);
    fileInput.value = "";

});

// Drag and drop
dropArea.addEventListener("dragover", event => {

    event.preventDefault();
    dropArea.classList.add("drag-over");

});

dropArea.addEventListener("dragleave", () => {

    dropArea.classList.remove("drag-over");

});

dropArea.addEventListener("drop", event => {

    event.preventDefault();
    dropArea.classList.remove("drag-over");

    addFiles(event.dataTransfer.files);

});


// UPLOAD DOCUMENTS
uploadBtn.addEventListener("click", async () => {

    if (selectedFiles.length === 0) return;

    const formData = new FormData();

    selectedFiles.forEach(file => {
        formData.append("files", file);
    });

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Processing Documents...";

    try {

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Upload failed");
        }

        document.getElementById("uploadSection").style.display = "none";

        document.getElementById("chatSection").style.display = "block";

        document.getElementById("chatStatus").textContent =
            `${result.files_uploaded} documents uploaded successfully!`;

        selectedFiles = [];
        displayFiles();

    } catch (error) {

        alert(error.message);

        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload & Start Chatting →";

    }

});


// CHAT ELEMENTS
const sendBtn = document.getElementById("sendBtn");
const questionInput = document.getElementById("questionInput");
const chatMessages = document.getElementById("chatMessages");


// SAFELY CREATE TEXT ELEMENTS
function createTextElement(tag, text, className = "") {

    const element = document.createElement(tag);

    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}


// MANUALLY FORMAT RETRIEVED DOCUMENT TEXT
function formatDocumentText(text) {

    const container = document.createElement("div");

    container.className = "answer-content";

    // Handle PDF extraction where multiple points may appear on one line
    const normalized = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/([.!?])\s+(?=(?:[A-Z][a-zA-Z /()&-]*:))/g, "$1\n")
        .replace(/\s+(?=•)/g, "\n")
        .replace(/\s+(?=\d+\.\s+(?:[A-Z]|The|Each|It|A|An|After|Finally))/g, "\n");

    const lines = normalized.split("\n");

    let paragraph = [];

    function flushParagraph() {

        if (paragraph.length === 0) return;

        const p = createTextElement(
            "p",
            paragraph.join(" ").trim()
        );

        container.appendChild(p);
        paragraph = [];

    }

    lines.forEach(rawLine => {

        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            return;
        }

        // Main numbered heading
        if (/^\d+\.\s+[A-Z]/.test(line)) {

            flushParagraph();

            container.appendChild(
                createTextElement("h3", line)
            );

        }

        // Lettered heading
        else if (/^[A-Z]\.\s+/.test(line)) {

            flushParagraph();

            container.appendChild(
                createTextElement("h3", line)
            );

        }

        // Subheading
        else if (/^\d+\.\d+\s+/.test(line)) {

            flushParagraph();

            container.appendChild(
                createTextElement("h4", line)
            );

        }

        // Label headings such as Advantages:
        else if (/^(Advantages|Disadvantages|Working Procedure|Conclusion|Introduction|Methods of .+):?$/i.test(line)) {

            flushParagraph();

            container.appendChild(
                createTextElement("h4", line)
            );

        }

        // Bullet points
        else if (/^[•●▪\-]\s*/.test(line)) {

            flushParagraph();

            const bullet = createTextElement(
                "div",
                line.replace(/^[•●▪\-]\s*/, ""),
                "answer-bullet"
            );

            bullet.textContent = "• " + line.replace(/^[•●▪\-]\s*/, "");

            container.appendChild(bullet);

        }

        // Numbered procedure points
        else if (/^\d+\.\s+/.test(line)) {

            flushParagraph();

            container.appendChild(
                createTextElement("div", line, "answer-number")
            );

        }

        // Normal paragraph
        else {

            paragraph.push(line);

        }

    });

    flushParagraph();

    return container;
}


// DISPLAY RETRIEVED DOCUMENTS
function displayFormattedAnswer(documents) {

    const botMessage = document.createElement("div");

    botMessage.className = "bot-message";

    botMessage.appendChild(
        createTextElement("strong", "DocuMind")
    );

    if (!documents || documents.length === 0) {

        botMessage.appendChild(
            createTextElement("p", "No relevant information found.")
        );

    } else {

        documents.forEach((doc, index) => {

            const documentContent = document.createElement("div");

            documentContent.className = "document-result";

            // Document heading
            documentContent.appendChild(
                createTextElement(
                    "h4",
                    `Retrieved Content ${index + 1}`
                )
            );

            // Support both structured and plain-text backend responses
            if (Array.isArray(doc.content)) {

                const formatted = document.createElement("div");

                formatted.className = "answer-content";

                doc.content.forEach(item => {

                    const tag =
                        item.type === "heading" ? "h3" :
                        item.type === "subheading" ? "h4" :
                        item.type === "bullet" ? "div" :
                        "p";

                    const element = createTextElement(
                        tag,
                        item.type === "bullet"
                            ? "• " + item.text
                            : item.text
                    );

                    if (item.type === "bullet") {
                        element.className = "answer-bullet";
                    }

                    if (item.type === "number") {
                        element.className = "answer-number";
                    }

                    formatted.appendChild(element);

                });

                documentContent.appendChild(formatted);

            } else {

                documentContent.appendChild(
                    formatDocumentText(doc.text || doc.content || "")
                );

            }

            // Source
            documentContent.appendChild(
                createTextElement(
                    "small",
                    "Source: " + (doc.source || "Uploaded document"),
                    "source-info"
                )
            );

            botMessage.appendChild(documentContent);

        });

    }

    chatMessages.appendChild(botMessage);

    chatMessages.scrollTop = chatMessages.scrollHeight;
}


// SEND QUESTION TO FLASK
async function sendQuestion() {

    const question = questionInput.value.trim();

    if (!question || sendBtn.disabled) return;

    // Display user question
    const userMessage = createTextElement(
        "div",
        question,
        "user-message"
    );

    chatMessages.appendChild(userMessage);

    questionInput.value = "";

    sendBtn.disabled = true;
    sendBtn.textContent = "Searching...";

    const loading = createTextElement(
        "div",
        "Searching your documents...",
        "bot-message loading-message"
    );

    chatMessages.appendChild(loading);

    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {

        const response = await fetch("/search", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                question: question
            })

        });

        const result = await response.json();

        loading.remove();

        if (!response.ok) {
            throw new Error(result.error || "Search failed");
        }

        displayFormattedAnswer(result.retrieved_documents);

    } catch (error) {

        loading.remove();

        const errorMessage = createTextElement(
            "div",
            error.message,
            "bot-message"
        );

        chatMessages.appendChild(errorMessage);

    } finally {

        sendBtn.disabled = false;
        sendBtn.textContent = "Send ➤";

        questionInput.focus();

        chatMessages.scrollTop = chatMessages.scrollHeight;

    }

}


// CHAT EVENTS
sendBtn.addEventListener("click", sendQuestion);

questionInput.addEventListener("keydown", event => {

    if (event.key === "Enter") {
        sendQuestion();
    }

});
