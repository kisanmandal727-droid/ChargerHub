import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Clock,
  Compass,
  Heart,
  ImagePlus,
  MessageCircle,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  MapPin,
  Zap,
  X,
} from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '');
const COMMENT_EMOJIS = ['😊', '😂', '❤️', '😍', '👍', '👏', '⚡', '🔋', '🚗', '🙌'];
const imageUrlFor = (post) => post.has_image
  ? `${API_ORIGIN}/api/buzz/posts/${encodeURIComponent(post.id)}/image`
  : post.image_url;

function initials(name = '') {
  return String(name).trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CH';
}

function UserAvatar({ name, photo, className }) {
  return (
    <div className={className}>
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </div>
  );
}

function relativeTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'just now';
  const ageMins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (ageMins < 1) return 'just now';
  if (ageMins < 60) return `${ageMins}m ago`;
  const ageHours = Math.floor(ageMins / 60);
  if (ageHours < 24) return `${ageHours}h ago`;
  const ageDays = Math.floor(ageHours / 24);
  return ageDays < 7 ? `${ageDays}d ago` : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that photo. Try another image.'));
    reader.readAsDataURL(blob);
  });
}

async function compressPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP photo.');
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a photo smaller than 15 MB.');
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot prepare the photo. Try a recent version of Chrome or Edge.');

  const bitmap = await createImageBitmap(file);
  try {
    let maxDimension = 1600;
    while (maxDimension >= 760) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare that photo. Try another image.');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.84, 0.72, 0.60, 0.48, 0.40]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= 560 * 1024) return await readAsDataUrl(blob);
      }
      maxDimension = Math.floor(maxDimension * 0.78);
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error('Could not reduce the photo size enough. Choose a smaller photo.');
}

export default function BuzzView() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('Discover');
  const [activeTag, setActiveTag] = useState('#ChargerHub');
  const [sharedPostId, setSharedPostId] = useState(() => new URLSearchParams(window.location.search).get('buzzPost'));
  const [searchQuery, setSearchQuery] = useState('');
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [postCategory, setPostCategory] = useState(isAdmin ? 'ChargerHub' : 'Trips');
  const [tripStatus, setTripStatus] = useState('planned');
  const [tripOrigin, setTripOrigin] = useState('');
  const [tripDestination, setTripDestination] = useState('');
  const [tripDistance, setTripDistance] = useState('');
  const [tripTravelTime, setTripTravelTime] = useState('');
  const [tripChargingStops, setTripChargingStops] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [commentPost, setCommentPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [deletingCommentId, setDeletingCommentId] = useState(null);
  const [busyPostId, setBusyPostId] = useState(null);
  const [notice, setNotice] = useState('');
  const [composerError, setComposerError] = useState('');
  const imageInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const canOpenComposer = activeTab === 'Discover' && (isAdmin || activeTag === '#Trips');

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true);
    setFeedError('');
    try {
      const response = activeTab === 'Saved Posts'
        ? await api.get('/buzz/saved')
        : sharedPostId && activeTab === 'Discover'
          ? await api.get(`/buzz/posts?post_id=${encodeURIComponent(sharedPostId)}`)
          : await api.get(`/buzz/posts?tag=${encodeURIComponent(activeTag)}`);
      setPosts(response.posts || []);
      if (sharedPostId && activeTab === 'Discover') {
        const sharedCategory = response.posts?.[0]?.category;
        if (sharedCategory) {
          const sharedTag = `#${String(sharedCategory).replace(/^#/, '')}`;
          setActiveTag(sharedTag);
          setPostCategory(sharedTag === '#Trips' ? 'Trips' : 'ChargerHub');
        }
        setSharedPostId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('buzzPost');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err) {
      console.error('Buzz feed error:', err);
      setFeedError(err.message || 'Could not load ChargerHub posts. Please try again.');
    } finally {
      setLoadingPosts(false);
    }
  }, [activeTab, activeTag, sharedPostId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    if (!imagePreview) return undefined;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const updatePost = (postId, changes) => {
    setPosts((current) => current.map((post) => String(post.id) === String(postId) ? { ...post, ...changes } : post));
  };

  const handleLike = async (post) => {
    if (busyPostId === post.id) return;
    setBusyPostId(post.id);
    try {
      const response = await api.post(`/buzz/posts/${post.id}/like`, {});
      updatePost(post.id, { is_liked: response.liked, likes_count: response.likes_count });
    } catch (err) {
      showNotice(err.message || 'Could not update the like.');
    } finally {
      setBusyPostId(null);
    }
  };

  const handleSave = async (post) => {
    if (busyPostId === post.id) return;
    setBusyPostId(post.id);
    try {
      const response = await api.post(`/buzz/posts/${post.id}/save`, {});
      if (activeTab === 'Saved Posts' && !response.saved) {
        setPosts((current) => current.filter((item) => String(item.id) !== String(post.id)));
      } else {
        updatePost(post.id, { is_saved: response.saved });
      }
      showNotice(response.saved ? 'Post saved to Saved Posts.' : 'Post removed from Saved Posts.');
    } catch (err) {
      showNotice(err.message || 'Could not update saved posts.');
    } finally {
      setBusyPostId(null);
    }
  };

  const handleShare = async (post) => {
    const url = new URL(window.location.href);
    url.searchParams.set('buzzPost', post.id);
    const shareUrl = url.toString();
    const shareData = {
      title: post.title || 'ChargerHub community post',
      text: post.content,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        showNotice('Post shared.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${post.content}\n${shareUrl}`);
        showNotice('Post description and ChargerHub link copied.');
      } else {
        showNotice('Sharing is not available in this browser.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showNotice('Could not share this post. Please try again.');
    }
  };

  const handleDeletePost = async (post) => {
    if (!window.confirm('Delete this post? Its photo, likes, saves, comments, and replies will also be removed.')) return;
    setDeletingPostId(post.id);
    try {
      await api.delete(`/buzz/posts/${post.id}`);
      setPosts((current) => current.filter((item) => String(item.id) !== String(post.id)));
      if (String(commentPost?.id) === String(post.id)) setCommentPost(null);
      showNotice('Post deleted.');
    } catch (err) {
      showNotice(err.message || 'Could not delete this post.');
    } finally {
      setDeletingPostId(null);
    }
  };

  const openComments = async (post) => {
    setCommentPost(post);
    setComments([]);
    setCommentDraft('');
    setReplyTarget(null);
    setEmojiPickerOpen(false);
    setCommentsLoading(true);
    try {
      const response = await api.get(`/buzz/posts/${post.id}/comments`);
      setComments(response.comments || []);
    } catch (err) {
      showNotice(err.message || 'Could not load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    if (!commentPost || !commentDraft.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const response = await api.post(`/buzz/posts/${commentPost.id}/comments`, {
        content: commentDraft.trim(),
        parent_comment_id: replyTarget?.id || null,
      });
      setComments((current) => [...current, response.comment]);
      setCommentDraft('');
      setReplyTarget(null);
      setEmojiPickerOpen(false);
      updatePost(commentPost.id, { comments_count: response.comments_count });
      setCommentPost((current) => current ? { ...current, comments_count: response.comments_count } : current);
    } catch (err) {
      showNotice(err.message || 'Could not post your comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const startReply = (comment) => {
    setReplyTarget(comment);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
  };

  const appendEmoji = (emoji) => {
    setCommentDraft((current) => `${current}${emoji}`);
    setEmojiPickerOpen(false);
    window.requestAnimationFrame(() => commentInputRef.current?.focus());
  };

  const handleDeleteComment = async (comment) => {
    if (!window.confirm('Delete this comment?')) return;
    setDeletingCommentId(comment.id);
    try {
      const response = await api.delete(`/buzz/posts/${commentPost.id}/comments/${comment.id}`);
      setComments((current) => current.filter((item) => String(item.id) !== String(comment.id)));
      setCommentPost((current) => current ? { ...current, comments_count: response.comments_count } : current);
      updatePost(commentPost.id, { comments_count: response.comments_count });
      if (String(replyTarget?.id) === String(comment.id)) setReplyTarget(null);
      showNotice('Comment deleted.');
    } catch (err) {
      showNotice(err.message || 'Could not delete this comment.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setComposerError('');
  };

  const clearComposerPhoto = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview('');
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const publishPost = async (event) => {
    event.preventDefault();
    if (!postCaption.trim()) {
      setComposerError('Write a description before publishing.');
      return;
    }
    setPublishing(true);
    setComposerError('');
    try {
      const imageDataUrl = imageFile ? await compressPhoto(imageFile) : '';
      const tripDetails = postCategory === 'Trips' ? {
        status: tripStatus,
        origin: tripOrigin.trim(),
        destination: tripDestination.trim(),
        distance_km: Number(tripDistance),
        travel_time: tripTravelTime.trim(),
        charging_stops: tripChargingStops.split(/\r?\n/).map((stop) => stop.trim()).filter(Boolean),
      } : null;
      const response = await api.post('/buzz/posts', {
        title: postTitle.trim(),
        content: postCaption.trim(),
        category: postCategory,
        trip_details: tripDetails,
        image_data_url: imageDataUrl,
      });
      setActiveTab('Discover');
      setActiveTag(postCategory === 'Trips' ? '#Trips' : '#ChargerHub');
      setPosts((current) => [response.post, ...current.filter((post) => String(post.id) !== String(response.post.id))]);
      setPostTitle('');
      setPostCaption('');
      setPostCategory(postCategory);
      setTripStatus('planned');
      setTripOrigin('');
      setTripDestination('');
      setTripDistance('');
      setTripTravelTime('');
      setTripChargingStops('');
      clearComposerPhoto();
      setComposerOpen(false);
      showNotice('Your post is now visible to ChargerHub users.');
    } catch (err) {
      setComposerError(err.message || 'Could not publish this post. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const filteredPosts = posts.filter((post) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [post.title, post.content, post.author_name, post.author_handle, post.category,
      post.trip_details?.origin, post.trip_details?.destination, post.trip_details?.travel_time,
      ...(post.trip_details?.charging_stops || [])]
      .some((value) => String(value || '').toLowerCase().includes(query));
  });

  return (
    <div className="buzz-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, background: '#F8FAFC' }}>
      <header className="buzz-header" style={{ background: '#151C38', color: '#FFFFFF', padding: '24px 20px 16px', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px' }}>
        <div className="buzz-header-inner">
          <div className="buzz-header-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>ChargerHubBuzz</span><span style={{ fontSize: '18px' }}>🍃</span>
              </h2>
              <p style={{ marginTop: '4px', color: '#CBD5E1', fontSize: '12px' }}>Stories and updates from ChargerHub</p>
            </div>
            {isAdmin && (
              <div className="buzz-admin-pill">
                <UserAvatar name={user?.name || 'ChargerHub'} photo={user?.avatar_url} className="buzz-admin-avatar" />
                <span>{user?.name || 'ChargerHub Admin'}</span>
                <CheckCircle2 size={15} fill="#1688F8" color="#FFFFFF" aria-label="Verified admin" />
              </div>
            )}
          </div>

          <nav className="buzz-main-tabs" aria-label="Buzz sections">
            {[
              { label: 'Discover', icon: Compass },
              { label: 'Saved Posts', icon: Bookmark },
            ].map(({ label, icon: Icon }) => {
              const selected = activeTab === label;
              return (
                <button key={label} type="button" onClick={() => setActiveTab(label)} aria-pressed={selected} className={`buzz-main-tab${selected ? ' active' : ''}`}>
                  <Icon size={21} color={selected ? '#00C896' : '#151C38'} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="buzz-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px', minWidth: 0 }}>
        <div className="buzz-content">
          {canOpenComposer && (
            <section className="buzz-composer-card">
              {!composerOpen ? (
                <button className="buzz-create-trigger" type="button" onClick={() => { setPostCategory(activeTag === '#Trips' ? 'Trips' : isAdmin ? 'ChargerHub' : 'Trips'); setComposerOpen(true); }}>
                  <UserAvatar name={user?.name || 'ChargerHub'} photo={user?.avatar_url} className="buzz-admin-avatar" />
                  <span className="buzz-create-prompt">{isAdmin && activeTag !== '#Trips' ? 'Share an update with ChargerHub users…' : 'Share a planned or completed trip…'}</span>
                  <span className="buzz-create-icon"><Plus size={19} /></span>
                </button>
              ) : (
                <form onSubmit={publishPost}>
                  <div className="buzz-composer-heading">
                    <div>
                      <h3>{postCategory === 'Trips' ? 'Share a trip' : 'Create a post'}</h3>
                      <p>{postCategory === 'Trips' ? 'Share the journey details so the community can follow your route.' : 'Only admins can publish ChargerHub updates.'}</p>
                    </div>
                    <button type="button" className="buzz-icon-button" onClick={() => { setComposerOpen(false); setComposerError(''); }} aria-label="Close post composer"><X size={18} /></button>
                  </div>

                  <div className="buzz-composer-author">
                    <UserAvatar name={user?.name || 'ChargerHub'} photo={user?.avatar_url} className="buzz-admin-avatar" />
                    <strong>{user?.name || (isAdmin ? 'ChargerHub Admin' : 'ChargerHub user')}</strong>
                    {isAdmin && <CheckCircle2 size={16} fill="#1688F8" color="#FFFFFF" aria-label="Verified admin" />}
                    <span>{isAdmin ? '@chargerhub' : 'Community trip'}</span>
                  </div>

                  <input
                    type="text"
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                    placeholder="Heading (optional)"
                    maxLength={100}
                    className="buzz-title-input"
                  />
                  <textarea
                    value={postCaption}
                    onChange={(event) => setPostCaption(event.target.value)}
                    placeholder="Write a description…"
                    maxLength={2000}
                    rows={4}
                    className="buzz-caption-input"
                    required
                  />

                  {postCategory === 'Trips' && (
                    <section className="buzz-trip-fields" aria-label="Trip details">
                      <div className="buzz-trip-fields-heading">
                        <MapPin size={17} />
                        <strong>Journey details</strong>
                      </div>
                      <div className="buzz-trip-status-toggle" aria-label="Trip status">
                        {[
                          { value: 'planned', label: 'Planned' },
                          { value: 'completed', label: 'Completed' },
                        ].map((option) => (
                          <button key={option.value} type="button" onClick={() => setTripStatus(option.value)} aria-pressed={tripStatus === option.value} className={tripStatus === option.value ? 'active' : ''}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <div className="buzz-trip-route-fields">
                        <label>Starting point
                          <input value={tripOrigin} onChange={(event) => setTripOrigin(event.target.value)} placeholder="Enter start location" maxLength={100} required />
                        </label>
                        <label>Destination
                          <input value={tripDestination} onChange={(event) => setTripDestination(event.target.value)} placeholder="Enter destination" maxLength={100} required />
                        </label>
                      </div>
                      <div className="buzz-trip-route-fields">
                        <label>Distance (km)
                          <input type="number" value={tripDistance} onChange={(event) => setTripDistance(event.target.value)} placeholder="e.g. 120" min="1" max="10000" step="0.1" required />
                        </label>
                        <label>Travel time
                          <input value={tripTravelTime} onChange={(event) => setTripTravelTime(event.target.value)} placeholder="e.g. 2 hours 30 minutes" maxLength={80} required />
                        </label>
                      </div>
                      <label className="buzz-trip-stops-field">Charging stops <span>(optional, one per line)</span>
                        <textarea value={tripChargingStops} onChange={(event) => setTripChargingStops(event.target.value)} placeholder={'Station name or location\nAdd another stop on a new line'} rows={2} />
                      </label>
                    </section>
                  )}

                  {imagePreview && (
                    <div className="buzz-image-preview-wrap">
                      <img src={imagePreview} alt="Post preview" className="buzz-image-preview" />
                      <button type="button" onClick={clearComposerPhoto} aria-label="Remove selected photo" className="buzz-remove-photo"><X size={17} /></button>
                    </div>
                  )}

                  <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} style={{ display: 'none' }} />
                  <div className="buzz-composer-actions">
                    <button type="button" className="buzz-photo-button" onClick={() => imageInputRef.current?.click()}>
                      <ImagePlus size={17} /> {imageFile ? 'Change photo' : 'Add photo'}
                    </button>
                    {isAdmin ? (
                      <select value={postCategory} onChange={(event) => setPostCategory(event.target.value)} aria-label="Post category" className="buzz-category-select">
                        <option value="ChargerHub">#ChargerHub</option>
                        <option value="Trips">#Trips</option>
                      </select>
                    ) : <span className="buzz-fixed-category">#Trips</span>}
                    <button type="submit" className="buzz-publish-button" disabled={publishing || !postCaption.trim()}>
                      {publishing ? 'Publishing…' : 'Publish'}
                    </button>
                  </div>
                  {imageFile && <p className="buzz-photo-note">Photos are automatically resized before upload.</p>}
                  {composerError && <p className="buzz-error" role="alert">{composerError}</p>}
                </form>
              )}
            </section>
          )}

          <>
              {activeTab === 'Discover' && (
                <div className="buzz-category-tabs" aria-label="Post category">
                  {['#ChargerHub', '#Trips'].map((tag) => (
                    <button key={tag} type="button" onClick={() => { setActiveTag(tag); setPostCategory(tag === '#Trips' ? 'Trips' : 'ChargerHub'); }} aria-pressed={activeTag === tag} className={`buzz-category-tab${activeTag === tag ? ' active' : ''}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <label className="buzz-search">
                <Search size={18} color="#94A3B8" />
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={activeTab === 'Saved Posts' ? 'Search saved posts' : 'Search posts'} />
              </label>

              {notice && <div role="status" className="buzz-notice">{notice}</div>}
              {feedError && <div role="alert" className="buzz-error buzz-feed-error">{feedError}<button type="button" onClick={fetchPosts}>Try again</button></div>}

              {loadingPosts ? (
                <div className="buzz-empty-state">Loading posts…</div>
              ) : !feedError && filteredPosts.length === 0 ? (
                <div className="buzz-empty-state">
                  <Compass size={32} color="#00A87E" />
                  <strong>{activeTab === 'Saved Posts' ? 'No saved posts yet' : searchQuery ? 'No posts match your search' : 'No posts here yet'}</strong>
                  <span>{activeTab === 'Saved Posts'
                    ? 'Tap the bookmark on a post to keep it here.'
                    : activeTab === 'Discover' && activeTag === '#Trips'
                      ? 'Share a planned or completed journey with its route, distance, travel time, and charging stops.'
                      : 'Check back soon for ChargerHub updates.'}</span>
                </div>
              ) : (
                <div className="buzz-post-feed">
                  {filteredPosts.map((post) => {
                    const isVerified = post.author_verified || post.author_badge === 'Verified Partner';
                    const ownsTripPost = Boolean(post.trip_details && post.author_user_id && user?.firebase_uid)
                      && String(post.author_user_id) === String(user.firebase_uid);
                    const isOwnPost = Boolean(post.author_user_id && user?.firebase_uid)
                      && String(post.author_user_id) === String(user.firebase_uid);
                    const canDeletePost = isAdmin || ownsTripPost;
                    const postImage = imageUrlFor(post);
                    return (
                      <article className="buzz-post-card" key={post.id}>
                        <header className="buzz-post-author">
                          <UserAvatar
                            name={post.author_name}
                            photo={post.author_avatar_url || (isOwnPost ? user?.avatar_url : '')}
                            className="buzz-post-avatar"
                          />
                          <div className="buzz-author-info">
                            <div className="buzz-author-name-line">
                              <strong>{post.author_name || 'ChargerHub'}</strong>
                              {isVerified && <CheckCircle2 size={16} fill="#1688F8" color="#FFFFFF" aria-label="Verified account" />}
                              <span className="buzz-post-age">· {relativeTime(post.created_at)}</span>
                            </div>
                            <span className="buzz-post-handle">{post.author_handle || (isVerified ? '@chargerhub' : post.trip_details ? 'Community trip' : '')}</span>
                          </div>
                          <div className="buzz-post-header-actions">
                            <span className="buzz-post-tag">#{String(post.category || 'ChargerHub').replace(/^#/, '')}</span>
                            {canDeletePost && (
                              <button
                                type="button"
                                className="buzz-delete-post-button"
                                onClick={() => handleDeletePost(post)}
                                disabled={deletingPostId === post.id}
                                aria-label="Delete post"
                                title="Delete post"
                              >
                                <Trash2 size={17} />
                              </button>
                            )}
                          </div>
                        </header>

                        {postImage && (
                          <div className="buzz-post-image-wrap">
                            <img src={postImage} alt={post.title || `Post by ${post.author_name || 'ChargerHub'}`} className="buzz-post-image" loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                          </div>
                        )}

                        {post.trip_details && (
                          <section className="buzz-trip-card" aria-label="Shared trip details">
                            <div className="buzz-trip-card-heading">
                              <span className={`buzz-trip-status ${post.trip_details.status === 'completed' ? 'completed' : 'planned'}`}>
                                {post.trip_details.status === 'completed' ? 'Completed journey' : 'Planned journey'}
                              </span>
                            </div>
                            <div className="buzz-trip-route-display">
                              <div className="buzz-trip-stop-point">
                                <span>FROM</span>
                                <strong>{post.trip_details.origin}</strong>
                              </div>
                              <ArrowRight className="buzz-trip-route-arrow" size={19} />
                              <div className="buzz-trip-stop-point">
                                <span>TO</span>
                                <strong>{post.trip_details.destination}</strong>
                              </div>
                            </div>
                            <div className="buzz-trip-metrics">
                              <span><MapPin size={15} /> {post.trip_details.distance_km} km</span>
                              <span><Clock size={15} /> {post.trip_details.travel_time}</span>
                            </div>
                            <div className="buzz-trip-stops">
                              <strong><Zap size={15} /> Charging stops</strong>
                              {post.trip_details.charging_stops?.length ? (
                                <ul>{post.trip_details.charging_stops.map((stop, index) => <li key={`${stop}-${index}`}>{stop}</li>)}</ul>
                              ) : <span>No charging stops listed</span>}
                            </div>
                          </section>
                        )}

                        <div className="buzz-post-body">
                          {post.title && <h3 className="buzz-post-title">{post.title}</h3>}
                          <p className="buzz-post-caption"><strong>{post.author_name || 'ChargerHub'}</strong> {post.content}</p>
                          {Number(post.comments_count || 0) > 0 && (
                            <button type="button" className="buzz-view-comments" onClick={() => openComments(post)}>
                              View all {post.comments_count} comments
                            </button>
                          )}
                          <div className="buzz-post-actions">
                            <div className="buzz-post-actions-left">
                              <button type="button" onClick={() => handleLike(post)} aria-label={post.is_liked ? 'Unlike post' : 'Like post'} aria-pressed={Boolean(post.is_liked)} className="buzz-action-button">
                                <Heart size={21} color={post.is_liked ? '#E53956' : '#151C38'} fill={post.is_liked ? '#E53956' : 'none'} />
                                <span>{Number(post.likes_count || 0)}</span>
                              </button>
                              <button type="button" onClick={() => openComments(post)} aria-label="Open comments" className="buzz-action-button">
                                <MessageCircle size={21} /><span>{Number(post.comments_count || 0)}</span>
                              </button>
                              <button type="button" onClick={() => handleShare(post)} aria-label="Share post" className="buzz-action-button buzz-share-action">
                                <Send size={20} /><span>Share</span>
                              </button>
                            </div>
                            <button type="button" onClick={() => handleSave(post)} aria-label={post.is_saved ? 'Remove from saved posts' : 'Save post'} aria-pressed={Boolean(post.is_saved)} className="buzz-bookmark-button">
                              <Bookmark size={21} fill={post.is_saved ? '#151C38' : 'none'} />
                            </button>
                          </div>
                          <time className="buzz-post-date">{new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          </>
        </div>
      </main>

      {commentPost && (
        <div className="modal-overlay buzz-comments-overlay" onClick={() => setCommentPost(null)}>
          <section className="bottom-sheet buzz-comments-sheet" role="dialog" aria-modal="true" aria-labelledby="buzz-comments-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="buzz-comments-header">
              <h3 id="buzz-comments-title">Comments</h3>
              <button type="button" onClick={() => setCommentPost(null)} aria-label="Close comments" className="buzz-icon-button"><X size={19} /></button>
            </div>
            {commentPost.title && <p className="buzz-comments-post-title">{commentPost.title}</p>}
            <div className="buzz-comment-list" aria-live="polite">
              {commentsLoading ? <p className="buzz-comments-empty">Loading comments…</p>
                : comments.length === 0 ? <p className="buzz-comments-empty">No comments yet. Start the conversation.</p>
                  : comments.map((comment) => (
                    <article className={`buzz-comment${comment.parent_comment_id ? ' is-reply' : ''}`} key={comment.id}>
                      <UserAvatar
                        name={comment.author_name}
                        photo={comment.author_avatar_url || (String(comment.user_id) === String(user?.firebase_uid) ? user?.avatar_url : '')}
                        className="buzz-post-avatar small"
                      />
                      <div className="buzz-comment-content">
                        <div className="buzz-comment-author">
                          <strong>{comment.author_name || 'ChargerHub user'}</strong>
                          {comment.author_verified && <CheckCircle2 size={14} fill="#1688F8" color="#FFFFFF" aria-label="Verified admin" />}
                          <span>{relativeTime(comment.created_at)}</span>
                        </div>
                        {comment.parent_comment_id && comment.reply_to_name && (
                          <span className="buzz-reply-context">Replying to {comment.reply_to_name}</span>
                        )}
                        <p>{comment.content}</p>
                        <div className="buzz-comment-actions">
                          <button type="button" onClick={() => startReply(comment)}><Reply size={13} /> Reply</button>
                          {(isAdmin || String(comment.user_id) === String(user?.firebase_uid)) && (
                            <button
                              type="button"
                              className="buzz-comment-delete"
                              onClick={() => handleDeleteComment(comment)}
                              disabled={deletingCommentId === comment.id}
                              aria-label="Delete comment"
                            >
                              <Trash2 size={13} /> {deletingCommentId === comment.id ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
            </div>
            <div className="buzz-comment-composer">
              {replyTarget && (
                <div className="buzz-replying-banner">
                  <span>Replying to <strong>{replyTarget.author_name || 'ChargerHub user'}</strong></span>
                  <button type="button" onClick={() => setReplyTarget(null)} aria-label="Cancel reply"><X size={15} /></button>
                </div>
              )}
              {emojiPickerOpen && (
                <div className="buzz-emoji-picker" aria-label="Choose an emoji">
                  {COMMENT_EMOJIS.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => appendEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>
                  ))}
                </div>
              )}
              <form className="buzz-comment-form" onSubmit={submitComment}>
                <input ref={commentInputRef} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder={replyTarget ? 'Write a reply…' : 'Add a comment…'} maxLength={500} aria-label={replyTarget ? 'Write a reply' : 'Add a comment'} />
                <button type="button" className="buzz-emoji-button" onClick={() => setEmojiPickerOpen((open) => !open)} aria-label="Add an emoji" aria-expanded={emojiPickerOpen}><Smile size={19} /></button>
                <button type="submit" disabled={postingComment || !commentDraft.trim()} aria-label={replyTarget ? 'Post reply' : 'Post comment'}><Send size={18} /></button>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
