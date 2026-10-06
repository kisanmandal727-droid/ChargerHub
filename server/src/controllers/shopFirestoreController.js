import db from '../db/firestore.js';

export const getProducts = async (req, res) => {
  try {
    const { category } = req.query;
    let products = await db.list('products');
    if (category && category.toLowerCase() !== 'all') products = products.filter((item) => String(item.category).toLowerCase() === category.toLowerCase());
    products.sort((a, b) => a.id - b.id);
    return res.json({ products });
  } catch (err) {
    console.error('Error fetching products:', err);
    return res.status(500).json({ error: 'Failed to fetch shop products' });
  }
};

export const createOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1, shipping_address } = req.body;
    const amount = Number(quantity);
    if (!product_id || !shipping_address || !Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'product_id, a valid quantity, and shipping_address are required' });
    const product = await db.get('products', product_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const order_reference = `ORD-${Date.now().toString().slice(-6)}`;
    const order = await db.create('orders', { user_id: userId, product_id: Number(product_id), quantity: amount, total_amount: Number(product.price) * amount, shipping_address, status: 'Processing', order_reference });
    await db.create('notifications', { user_id: userId, title: 'Order Placed 🎉', message: `Order ${order_reference} for ${product.name} placed successfully.`, type: 'system', is_read: false });
    return res.status(201).json({ message: 'Order placed successfully', order });
  } catch (err) {
    console.error('Create order error:', err);
    return res.status(500).json({ error: 'Failed to place order' });
  }
};

export const getOrders = async (req, res) => {
  try {
    const orders = await db.where('orders', 'user_id', Number(req.user.id));
    orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const result = [];
    for (const order of orders) {
      const product = await db.get('products', order.product_id);
      result.push({ ...order, product_name: product?.name, image_url: product?.image_url, color: product?.color, power_spec: product?.power_spec });
    }
    return res.json({ orders: result });
  } catch (err) {
    console.error('Get orders error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
};
