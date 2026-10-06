import db from '../db/index.js';

export const getProducts = async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM products';
    const params = [];

    if (category && category.toLowerCase() !== 'all') {
      query += ' WHERE LOWER(category) = LOWER($1)';
      params.push(category);
    }
    query += ' ORDER BY id ASC';

    const result = await db.query(query, params);
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('Error fetching products:', err);
    return res.status(500).json({ error: 'Failed to fetch shop products' });
  }
};

export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1, shipping_address } = req.body;

    if (!product_id || !shipping_address) {
      return res.status(400).json({ error: 'product_id and shipping_address are required' });
    }

    const prodRes = await db.query('SELECT * FROM products WHERE id = $1', [product_id]);
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = prodRes.rows[0];

    const totalAmount = parseFloat(product.price) * quantity;
    const orderRef = `ORD-${Date.now().toString().slice(-6)}`;

    const orderRes = await db.query(
      `INSERT INTO orders (user_id, product_id, quantity, total_amount, shipping_address, status, order_reference)
       VALUES ($1, $2, $3, $4, $5, 'Processing', $6)
       RETURNING *`,
      [userId, product_id, quantity, totalAmount, shipping_address, orderRef]
    );

    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Order Placed 🎉', $2, 'system')`,
      [userId, `Order ${orderRef} for ${product.name} placed successfully.`]
    );

    return res.status(201).json({
      message: 'Order placed successfully',
      order: orderRes.rows[0]
    });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ error: 'Failed to place order' });
  }
};

export const getOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.query(
      `SELECT o.*, p.name as product_name, p.image_url, p.color, p.power_spec
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return res.json({ orders: result.rows });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
};
