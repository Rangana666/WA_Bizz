import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const EMPTY_FORM = {
  product_code: '',
  name_en: '',
  name_si: '',
  name_ta: '',
  description_en: '',
  price: '',
  category: '',
  has_colors: false,
  colors: '',
  has_sizes: false,
  sizes: '',
  stock: '',
  image_url: '',
  is_active: true,
};

function ProductForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('image', file);
    setUploading(true);
    try {
      const { data } = await api.post('/products/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      set('image_url', data.url);
      toast.success('Image uploaded');
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Math.round(parseFloat(form.price) * 100),
        stock: parseInt(form.stock) || 0,
        colors: form.colors ? form.colors.split(',').map((s) => s.trim()).filter(Boolean) : [],
        sizes: form.sizes ? form.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Product code *</label>
          <input
            className={inputClass}
            value={form.product_code}
            onChange={(e) => set('product_code', e.target.value.toUpperCase())}
            placeholder="SHIRT-001"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Category</label>
          <input
            className={inputClass}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Tops"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Name (English) *</label>
        <input
          className={inputClass}
          value={form.name_en}
          onChange={(e) => set('name_en', e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name (Sinhala)</label>
          <input className={inputClass} value={form.name_si} onChange={(e) => set('name_si', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name (Tamil)</label>
          <input className={inputClass} value={form.name_ta} onChange={(e) => set('name_ta', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Description</label>
        <textarea
          className={`${inputClass} h-20 resize-none`}
          value={form.description_en}
          onChange={(e) => set('description_en', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Price (LKR) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className={inputClass}
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="1500.00"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Stock *</label>
          <input
            type="number"
            min="0"
            className={inputClass}
            value={form.stock}
            onChange={(e) => set('stock', e.target.value)}
            placeholder="10"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_colors}
              onChange={(e) => set('has_colors', e.target.checked)}
              className="accent-brand-500"
            />
            Has colours
          </label>
          {form.has_colors && (
            <input
              className={`${inputClass} mt-2`}
              value={form.colors}
              onChange={(e) => set('colors', e.target.value)}
              placeholder="Red, Blue, Black"
            />
          )}
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_sizes}
              onChange={(e) => set('has_sizes', e.target.checked)}
              className="accent-brand-500"
            />
            Has sizes
          </label>
          {form.has_sizes && (
            <input
              className={`${inputClass} mt-2`}
              value={form.sizes}
              onChange={(e) => set('sizes', e.target.value)}
              placeholder="S, M, L, XL"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Product image</label>
        <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm text-gray-400" />
        {form.image_url && (
          <img src={form.image_url} alt="preview" className="mt-2 w-24 h-24 object-cover rounded-lg" />
        )}
        {uploading && <p className="text-xs text-brand-400 mt-1">Uploading...</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
        >
          {saving ? 'Saving...' : 'Save product'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

  async function fetchProducts() {
    const { data } = await api.get('/products');
    setProducts(data);
  }

  useEffect(() => {
    fetchProducts().finally(() => setLoading(false));
  }, []);

  async function handleSave(payload) {
    try {
      if (editProduct) {
        await api.put(`/products/${editProduct.id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product created');
      }
      setShowForm(false);
      setEditProduct(null);
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this product?')) return;
    await api.delete(`/products/${id}`);
    toast.success('Product deleted');
    fetchProducts();
  }

  function startEdit(product) {
    setEditProduct({
      ...product,
      price: (product.price / 100).toFixed(2),
      colors: product.colors?.join(', ') || '',
      sizes: product.sizes?.join(', ') || '',
    });
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Product Catalog</h1>
        <button
          onClick={() => { setEditProduct(null); setShowForm(true); }}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg"
        >
          + Add product
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editProduct ? 'Edit product' : 'New product'}
          </h2>
          <ProductForm
            initial={editProduct}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditProduct(null); }}
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No products yet. Add your first product above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              {p.image_url && (
                <img src={p.image_url} alt={p.name_en} className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <p className="text-xs text-gray-500 font-mono">{p.product_code}</p>
                <p className="font-semibold text-white mt-0.5">{p.name_en}</p>
                <p className="text-brand-400 font-bold mt-1">
                  Rs {(p.price / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Stock: {p.stock}</p>
                {p.category && (
                  <span className="inline-block mt-2 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                    {p.category}
                  </span>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => startEdit(p)}
                    className="flex-1 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="flex-1 py-1.5 text-sm bg-red-900/40 hover:bg-red-900/70 text-red-400 rounded-lg"
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
