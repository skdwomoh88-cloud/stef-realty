const fs = require("fs");
const Document = require("../models/Document");
const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("../utils/rbac");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");
const { generateReferenceNumber } = require("../utils/referenceNumberGenerator");
const {
  RELATED_RESOURCES,
  requireDocumentRelationshipAccess,
  buildAgentDocumentScope,
} = require("../utils/documentAuthorization");
const { resolveDocumentPath } = require("../utils/documentStorage");

const relatedFields = Object.keys(RELATED_RESOURCES);
const populateDocument = (query) => query.populate("uploadedBy", "name email");

const createDocument = async (data, file, currentUser) => {
  if (!file) {
    throw new AppError("A document file is required.", 400, "DOCUMENT_FILE_REQUIRED");
  }

  const relationshipData = {};
  for (const field of relatedFields) {
    if (data[field]) relationshipData[field] = data[field];
  }

  await requireDocumentRelationshipAccess(relationshipData, currentUser);
  const documentNumber = await generateReferenceNumber(REFERENCE_PREFIXES.DOCUMENT, "document");
  const document = await Document.create({
    documentNumber,
    title: data.title,
    description: data.description,
    category: data.category,
    originalFileName: file.originalname,
    storedFileName: file.filename,
    mimeType: file.mimetype,
    fileSize: file.size,
    uploadedBy: currentUser._id,
    ...relationshipData,
  });
  return populateDocument(Document.findById(document._id));
};

const buildFilter = (query) => {
  const filter = {};
  for (const field of ["category", "uploadedBy", "relatedProperty", "relatedDeal", "relatedTask", "isArchived"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  return filter;
};

const listDocuments = async (query, currentUser, mineOnly = false) => {
  let { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = query;
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = buildFilter(query);

  if (isRole(currentUser.role, ROLES.AGENT)) {
    const scope = await buildAgentDocumentScope(currentUser._id);
    filter.$and = scope.$and;
    if (mineOnly) filter.uploadedBy = currentUser._id;
    if (query.isArchived === undefined) filter.isArchived = false;
  } else if (mineOnly) {
    filter.uploadedBy = currentUser._id;
  }

  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;
  const [documents, total] = await Promise.all([
    populateDocument(Document.find(filter))
      .sort({ [sortBy]: sortDirection }).skip(skip).limit(limit),
    Document.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return {
    documents,
    pagination: {
      total, page, limit, totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const findAuthorizedDocument = async (id, currentUser, includeStorage = false) => {
  let query = Document.findById(id);
  if (includeStorage) query = query.select("+storedFileName");
  const document = await populateDocument(query);
  if (!document) throw new AppError("Document not found.", 404, "DOCUMENT_NOT_FOUND");
  await requireDocumentRelationshipAccess(document, currentUser);
  return document;
};

const getDocumentById = (id, currentUser) => findAuthorizedDocument(id, currentUser);

const updateDocument = async (id, data, currentUser) => {
  const document = await findAuthorizedDocument(id, currentUser, true);
  for (const field of ["title", "description", "category"]) {
    if (data[field] !== undefined) document[field] = data[field];
  }
  await document.save();
  document.storedFileName = undefined;
  return document;
};

const archiveDocument = async (id, currentUser) => {
  const document = await findAuthorizedDocument(id, currentUser, true);
  document.isArchived = true;
  await document.save();
  document.storedFileName = undefined;
  return document;
};

const getDocumentFile = async (id, currentUser) => {
  const document = await findAuthorizedDocument(id, currentUser, true);
  const absolutePath = resolveDocumentPath(document.storedFileName);
  try {
    await fs.promises.access(absolutePath, fs.constants.R_OK);
  } catch {
    throw new AppError("Document file is unavailable.", 404, "DOCUMENT_FILE_NOT_FOUND");
  }
  return {
    absolutePath,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
  };
};

module.exports = {
  createDocument,
  listDocuments,
  getDocumentById,
  updateDocument,
  archiveDocument,
  getDocumentFile,
};
