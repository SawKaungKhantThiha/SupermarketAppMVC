const Product = require('../models/Product');

/**
 * ProductController (function-based)
 * Methods accept (req, res) and call the Product model methods.
 * Behavior is intentionally simple: render views or redirect to inventory on success.
 */

const ProductController = {
  // Admin inventory
  inventory(req, res) {
    Product.getAll((err, products) => {
      if (err) {
        console.error('Error fetching products:', err);
        return res.status(500).send('Database error');
      }
      const user = req.session ? req.session.user : null;
      return res.render('inventory', { products, user });
    });
  },

  // Shopping (user view)
  shopping(req, res) {
    Product.getAll((err, products) => {
      if (err) {
        console.error('Error fetching products:', err);
        return res.status(500).send('Database error');
      }
      const user = req.session ? req.session.user : null;
      return res.render('shopping', { products, user });
    });
  },

  // Get product by ID and render product view
  getById(req, res) {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Error fetching product:', err);
        return res.status(500).send('Database error');
      }
      if (!product) return res.status(404).send('Product not found');
      const user = req.session ? req.session.user : null;
      return res.render('product', { product, user });
    });
  },

  addForm(req, res) {
    const user = req.session ? req.session.user : null;
    return res.render('addProduct', { user });
  },

  // Add a new product (expects multipart/form-data for image via multer)
  add(req, res) {
    const { name, quantity, price, category } = req.body;
    const image = req.file ? req.file.filename : null;

    const product = {
      productName: name,
      quantity: quantity ? parseInt(quantity, 10) : 0,
      price: price ? parseFloat(price) : 0,
      image,
      category
    };

    Product.add(product, (err, result) => {
      if (err) {
        console.error('Error adding product:', err);
        return res.status(500).send('Database error');
      }
      return res.redirect('/inventory');
    });
  },

  editForm(req, res) {
    const id = req.params.id;
    Product.getById(id, (err, product) => {
      if (err) {
        console.error('Error fetching product:', err);
        return res.status(500).send('Database error');
      }
      if (!product) return res.status(404).send('Product not found');
      return res.render('updateProduct', { product });
    });
  },

  // Update existing product
  update(req, res) {
    const id = req.params.id;
    const { name, quantity, price, category } = req.body;
    // If a new file was uploaded, use it; otherwise keep currentImage (sent from form)
    let image = req.body.currentImage || null;
    if (req.file) image = req.file.filename;

    const product = {
      productName: name,
      quantity: quantity ? parseInt(quantity, 10) : 0,
      price: price ? parseFloat(price) : 0,
      image,
      category
    };

    Product.update(id, product, (err, result) => {
      if (err) {
        console.error('Error updating product:', err);
        return res.status(500).send('Database error');
      }
      return res.redirect('/inventory');
    });
  },

  // Delete a product
  delete(req, res) {
    const id = req.params.id;
    Product.delete(id, (err, result) => {
      if (err) {
        console.error('Error deleting product:', err);
        return res.status(500).send('Database error');
      }
      return res.redirect('/inventory');
    });
  }
};

module.exports = ProductController;
