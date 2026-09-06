const path = require("path");
const asyncHandler = require("../utils/asyncHandler");
const documentService = require("../services/documentService");
const { removeStoredDocument } = require("../utils/documentStorage");

const createDocument = asyncHandler(async (req, res) => {
  try {
    const document = await documentService.createDocument(req.body, req.file, req.user);
    res.status(201).json({
      success: true,
      message: "Document uploaded successfully.",
      data: document,
    });
  } catch (error) {
    if (req.file?.filename) await removeStoredDocument(req.file.filename);
    throw error;
  }
});

const getDocuments = asyncHandler(async (req, res) => {
  const result = await documentService.listDocuments(req.query, req.user);
  res.status(200).json({
    success: true,
    count: result.documents.length,
    data: result.documents,
    pagination: result.pagination,
  });
});

const getMyDocuments = asyncHandler(async (req, res) => {
  const result = await documentService.listDocuments(req.query, req.user, true);
  res.status(200).json({
    success: true,
    count: result.documents.length,
    data: result.documents,
    pagination: result.pagination,
  });
});

const getDocumentById = asyncHandler(async (req, res) => {
  const document = await documentService.getDocumentById(req.params.id, req.user);
  res.status(200).json({ success: true, data: document });
});

const downloadDocument = asyncHandler(async (req, res, next) => {
  const file = await documentService.getDocumentFile(req.params.id, req.user);
  const safeName = path.basename(file.originalFileName.replace(/\\/g, "/"));
  res.type(file.mimeType);
  res.download(file.absolutePath, safeName, (error) => {
    if (error && !res.headersSent) next(error);
  });
});

const updateDocument = asyncHandler(async (req, res) => {
  const document = await documentService.updateDocument(req.params.id, req.body, req.user);
  res.status(200).json({
    success: true,
    message: "Document updated successfully.",
    data: document,
  });
});

const archiveDocument = asyncHandler(async (req, res) => {
  const document = await documentService.archiveDocument(req.params.id, req.user);
  res.status(200).json({
    success: true,
    message: "Document archived successfully.",
    data: document,
  });
});

module.exports = {
  createDocument,
  getDocuments,
  getMyDocuments,
  getDocumentById,
  downloadDocument,
  updateDocument,
  archiveDocument,
};
