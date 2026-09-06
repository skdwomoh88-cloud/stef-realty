const fs = require("fs");
const path = require("path");
const AppError = require("./AppError");

const applicationRoot = path.resolve(__dirname, "..");
const configuredRoot = process.env.PRIVATE_DOCUMENT_UPLOAD_DIR ||
  path.join("private-uploads", "documents");
const documentRoot = path.resolve(applicationRoot, configuredRoot);
const publicUploadRoot = path.resolve(applicationRoot, "uploads");

if (
  documentRoot === publicUploadRoot ||
  documentRoot.startsWith(`${publicUploadRoot}${path.sep}`)
) {
  throw new AppError(
    "Private document storage cannot use the public uploads directory.",
    500,
    "INVALID_DOCUMENT_STORAGE_CONFIG"
  );
}

const ensureDocumentRoot = () => {
  fs.mkdirSync(documentRoot, { recursive: true });
};

const resolveDocumentPath = (storedFileName) => {
  if (!storedFileName || path.basename(storedFileName) !== storedFileName) {
    throw new AppError("Invalid document storage key.", 400, "INVALID_DOCUMENT_PATH");
  }

  const resolved = path.resolve(documentRoot, storedFileName);
  if (path.dirname(resolved) !== documentRoot) {
    throw new AppError("Invalid document storage key.", 400, "INVALID_DOCUMENT_PATH");
  }
  return resolved;
};

const removeStoredDocument = async (storedFileName) => {
  if (!storedFileName) return;
  try {
    await fs.promises.unlink(resolveDocumentPath(storedFileName));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

module.exports = {
  documentRoot,
  ensureDocumentRoot,
  resolveDocumentPath,
  removeStoredDocument,
};
