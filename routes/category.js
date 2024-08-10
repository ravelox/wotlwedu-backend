const express = require("express");

const Security = require("../util/security");

const router = express.Router();

const categoryController = require("../controllers/category");

// Add category
router.put("/", Security.checkCapability("category",["add"]), categoryController.putAddCategory);

// View single category or all categorys
router.get("/:categoryId", Security.checkCapability("category",["view"]),categoryController.getSingleCategory);
router.get("/", Security.checkCapability("category",["view"]), categoryController.getAllCategory);

// Edit a category
router.post("/:categoryId", Security.checkCapability("category",["edit"]), categoryController.postUpdateCategory);

// Delete a category
router.delete("/:categoryId", Security.checkCapability("category",["delete"]), categoryController.deleteCategory);

module.exports = router;
