import db from '../db/firestore.js';

const postIdFrom = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const socialDocId = (postId, firebaseUid) => `${postId}_${firebaseUid}`;
const normalizedTag = (tag) => String(tag || '').replace(/^#/, '').trim().toLowerCase();
const isVerifiedAuthor = (post) => post.author_verified === true || post.author_badge === 'Verified Partner';
const isCommunityTrip = (post) => normalizedTag(post.category) === 'trips'
  && Boolean(post.author_user_id)
  && Boolean(post.trip_details && typeof post.trip_details === 'object');
const visibleToCommunity = (post) => isVerifiedAuthor(post) || isCommunityTrip(post);

export async function syncAuthorAvatar(firebaseUid, avatarUrl) {
  const records = await Promise.all([
    db.collection('buzz_posts').where('author_user_id', '==', String(firebaseUid)).get(),
    db.collection('buzz_comments').where('user_id', '==', String(firebaseUid)).get(),
  ]);

  for (const snapshot of records) {
    // Profile images are data URLs, so keep each Firestore batch comfortably under
    // the per-request payload limit even when the chosen image is near its maximum.
    for (let start = 0; start < snapshot.docs.length; start += 10) {
      const batch = db.store().batch();
      snapshot.docs.slice(start, start + 10).forEach((record) => {
        batch.set(record.ref, { author_avatar_url: avatarUrl || null }, { merge: true });
      });
      await batch.commit();
    }
  }
}

async function addViewerState(posts, user) {
  const uid = String(user.firebase_uid);
  const [likes, saved] = await Promise.all([
    db.where('buzz_likes', 'user_id', uid),
    db.where('buzz_saved_posts', 'user_id', uid),
  ]);
  const likedIds = new Set(likes.map((item) => Number(item.post_id)));
  const savedIds = new Set(saved.map((item) => Number(item.post_id)));
  return posts.map((post) => ({
    ...post,
    image_url: post.has_image ? `/api/buzz/posts/${post.id}/image` : post.image_url || null,
    likes_count: Number(post.likes_count || 0),
    comments_count: Number(post.comments_count || 0),
    is_liked: likedIds.has(Number(post.id)),
    is_saved: savedIds.has(Number(post.id)),
    author_verified: isVerifiedAuthor(post),
  }));
}

export const getBuzzPosts = async (req, res) => {
  try {
    const { category, tag, post_id: requestedPostId } = req.query;
    let posts = (await db.list('buzz_posts')).filter(visibleToCommunity);
    const sharedPostId = requestedPostId ? postIdFrom(requestedPostId) : null;
    if (sharedPostId) {
      posts = posts.filter((post) => Number(post.id) === sharedPostId);
    } else if (category && category.toLowerCase() !== 'all') {
      posts = posts.filter((post) => normalizedTag(post.category) === normalizedTag(category));
    } else if (tag) {
      const wantedTag = normalizedTag(tag);
      posts = posts.filter((post) => normalizedTag(post.category) === wantedTag
        || (wantedTag === 'chargerhub' && post.author_badge === 'Verified Partner')
        || String(post.content || '').toLowerCase().includes(String(tag).toLowerCase()));
    }
    posts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ posts: await addViewerState(posts, req.user) });
  } catch (err) {
    console.error('Error fetching buzz posts:', err);
    return res.status(500).json({ error: 'Failed to fetch buzz posts' });
  }
};

export const getSavedBuzzPosts = async (req, res) => {
  try {
    const saved = await db.where('buzz_saved_posts', 'user_id', String(req.user.firebase_uid));
    saved.sort((a, b) => String(b.saved_at).localeCompare(String(a.saved_at)));
    const postsById = new Map((await db.list('buzz_posts'))
      .filter(visibleToCommunity)
      .map((post) => [Number(post.id), post]));
    const posts = saved.map((record) => postsById.get(Number(record.post_id))).filter(Boolean);
    return res.json({ posts: await addViewerState(posts, req.user) });
  } catch (err) {
    console.error('Error fetching saved Buzz posts:', err);
    return res.status(500).json({ error: 'Failed to fetch saved posts' });
  }
};

export const getPostImage = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    if (!postId) return res.status(404).end();
    const media = await db.get('buzz_media', postId);
    const match = String(media?.image_data_url || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=3600');
    return res.type(`image/${match[1]}`).send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Error fetching Buzz post image:', err);
    return res.status(500).end();
  }
};

export const createBuzzPost = async (req, res) => {
  let post;
  try {
    const title = String(req.body?.title || '').trim().slice(0, 100);
    const content = String(req.body?.content || '').trim();
    const category = normalizedTag(req.body?.category);
    const imageDataUrl = String(req.body?.image_data_url || '');
    const isAdmin = req.user.role === 'admin';

    if (!content) return res.status(400).json({ error: 'Add a description before publishing' });
    if (content.length > 2000) return res.status(400).json({ error: 'Keep the description under 2,000 characters' });
    if (!['chargerhub', 'trips'].includes(category)) return res.status(400).json({ error: 'Choose ChargerHub or Trips for this post' });
    if (!isAdmin && category !== 'trips') return res.status(403).json({ error: 'Only admins can publish ChargerHub updates. Choose #Trips to share a journey.' });

    let tripDetails = null;
    if (category === 'trips') {
      const details = req.body?.trip_details || {};
      const status = String(details.status || '').trim().toLowerCase();
      const origin = String(details.origin || '').trim().slice(0, 100);
      const destination = String(details.destination || '').trim().slice(0, 100);
      const distance = Number(details.distance_km);
      const travelTime = String(details.travel_time || '').trim().slice(0, 80);
      const rawStops = details.charging_stops;
      if (!['planned', 'completed'].includes(status)) return res.status(400).json({ error: 'Choose whether this trip is planned or completed' });
      if (!origin || !destination) return res.status(400).json({ error: 'Enter both the trip starting point and destination' });
      if (!Number.isFinite(distance) || distance <= 0 || distance > 10000) return res.status(400).json({ error: 'Enter a trip distance between 1 and 10,000 km' });
      if (!travelTime) return res.status(400).json({ error: 'Enter the trip travel time' });
      if (rawStops != null && !Array.isArray(rawStops)) return res.status(400).json({ error: 'Charging stops must be provided as a list' });
      const chargingStops = (rawStops || []).map((stop) => String(stop || '').trim()).filter(Boolean);
      if (chargingStops.length > 20 || chargingStops.some((stop) => stop.length > 100)) {
        return res.status(400).json({ error: 'Add up to 20 charging stops, each under 100 characters' });
      }
      tripDetails = { status, origin, destination, distance_km: distance, travel_time: travelTime, charging_stops: chargingStops };
    }

    let validImage = '';
    if (imageDataUrl) {
      const imageMatch = imageDataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!imageMatch) return res.status(400).json({ error: 'Upload a JPG, PNG, or WebP photo' });
      const imageBytes = Buffer.from(imageMatch[2], 'base64');
      if (imageDataUrl.length > 800000 || imageBytes.length > 580 * 1024) {
        return res.status(413).json({ error: 'This photo is still too large. Choose a smaller photo and try again.' });
      }
      validImage = imageDataUrl;
    }

    const authorName = String(req.user.name || req.user.email || (isAdmin ? 'ChargerHub Admin' : 'ChargerHub user')).trim().slice(0, 80);
    const authorProfile = await db.get('users', req.user.id);
    post = await db.create('buzz_posts', {
      author_name: authorName,
      author_avatar_url: authorProfile?.avatar_url || null,
      author_handle: isAdmin ? '@chargerhub' : '',
      author_badge: isAdmin ? 'Verified' : 'Community Member',
      author_verified: isAdmin,
      author_user_id: String(req.user.firebase_uid),
      title,
      content,
      category: category === 'trips' ? 'Trips' : 'ChargerHub',
      trip_details: tripDetails,
      image_url: null,
      has_image: Boolean(validImage),
      likes_count: 0,
      comments_count: 0,
    });

    if (validImage) {
      await db.create('buzz_media', {
        post_id: Number(post.id),
        image_data_url: validImage,
      }, post.id);
    }

    const [published] = await addViewerState([post], req.user);
    return res.status(201).json({ message: 'Post published', post: published });
  } catch (err) {
    if (post?.id) {
      try {
        await db.delete('buzz_posts', post.id);
        await db.delete('buzz_media', post.id);
      } catch (cleanupError) {
        console.error('Buzz post cleanup error:', cleanupError);
      }
    }
    console.error('Create Buzz post error:', err);
    return res.status(500).json({ error: 'Could not publish this post. Please try again.' });
  }
};

export const deleteBuzzPost = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const post = await db.get('buzz_posts', postId);
    if (!post || !visibleToCommunity(post)) return res.status(404).json({ error: 'Post not found' });
    const isOwner = String(post.author_user_id || '') === String(req.user.firebase_uid);
    if (req.user.role !== 'admin' && !(isOwner && isCommunityTrip(post))) {
      return res.status(403).json({ error: 'You can delete only your own trip post' });
    }

    for (const collectionName of ['buzz_likes', 'buzz_saved_posts', 'buzz_comments']) {
      const snapshot = await db.collection(collectionName).where('post_id', '==', postId).get();
      for (let start = 0; start < snapshot.docs.length; start += 450) {
        const batch = db.store().batch();
        snapshot.docs.slice(start, start + 450).forEach((record) => batch.delete(record.ref));
        await batch.commit();
      }
    }
    await db.delete('buzz_media', postId);
    await db.delete('buzz_posts', postId);
    return res.json({ message: 'Post and its comments were deleted' });
  } catch (err) {
    console.error('Delete Buzz post error:', err);
    return res.status(500).json({ error: 'Could not delete this post. Please try again.' });
  }
};

export const likePost = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const uid = String(req.user.firebase_uid);
    const postRef = db.collection('buzz_posts').doc(String(postId));
    const likeRef = db.collection('buzz_likes').doc(socialDocId(postId, uid));
    const result = await db.store().runTransaction(async (transaction) => {
      const [postSnap, likeSnap] = await Promise.all([transaction.get(postRef), transaction.get(likeRef)]);
      if (!postSnap.exists) return null;
      const post = postSnap.data();
      const liked = !likeSnap.exists;
      const likesCount = Math.max(0, Number(post.likes_count || 0) + (liked ? 1 : -1));
      if (liked) transaction.set(likeRef, { post_id: postId, user_id: uid, created_at: new Date().toISOString() });
      else transaction.delete(likeRef);
      transaction.set(postRef, { likes_count: likesCount, updated_at: new Date().toISOString() }, { merge: true });
      return { liked, likes_count: likesCount };
    });
    if (!result) return res.status(404).json({ error: 'Post not found' });
    return res.json({ message: result.liked ? 'Post liked' : 'Like removed', ...result });
  } catch (err) {
    console.error('Like post error:', err);
    return res.status(500).json({ error: 'Failed to update like' });
  }
};

export const toggleSavedPost = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const uid = String(req.user.firebase_uid);
    const postRef = db.collection('buzz_posts').doc(String(postId));
    const savedRef = db.collection('buzz_saved_posts').doc(socialDocId(postId, uid));
    const isSaved = await db.store().runTransaction(async (transaction) => {
      const [postSnap, savedSnap] = await Promise.all([transaction.get(postRef), transaction.get(savedRef)]);
      if (!postSnap.exists) return null;
      if (savedSnap.exists) {
        transaction.delete(savedRef);
        return false;
      }
      transaction.set(savedRef, { post_id: postId, user_id: uid, saved_at: new Date().toISOString() });
      return true;
    });
    if (isSaved === null) return res.status(404).json({ error: 'Post not found' });
    return res.json({ saved: isSaved });
  } catch (err) {
    console.error('Save Buzz post error:', err);
    return res.status(500).json({ error: 'Failed to update saved post' });
  }
};

export const getPostComments = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    const post = await db.get('buzz_posts', postId);
    if (!post || !visibleToCommunity(post)) return res.status(404).json({ error: 'Post not found' });
    const comments = await db.where('buzz_comments', 'post_id', postId);
    comments.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return res.json({ comments: comments.slice(-100) });
  } catch (err) {
    console.error('Fetch Buzz comments error:', err);
    return res.status(500).json({ error: 'Could not load comments' });
  }
};

export const addPostComment = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    const content = String(req.body?.content || '').trim();
    const parentCommentId = req.body?.parent_comment_id == null ? null : postIdFrom(req.body.parent_comment_id);
    if (!postId) return res.status(404).json({ error: 'Post not found' });
    if (!content) return res.status(400).json({ error: 'Write a comment first' });
    if (content.length > 500) return res.status(400).json({ error: 'Comments must be 500 characters or less' });
    if (req.body?.parent_comment_id != null && !parentCommentId) return res.status(400).json({ error: 'Choose a valid comment to reply to' });
    const post = await db.get('buzz_posts', postId);
    if (!post || !visibleToCommunity(post)) return res.status(404).json({ error: 'Post not found' });
    let parentComment = null;
    if (parentCommentId) {
      parentComment = await db.get('buzz_comments', parentCommentId);
      if (!parentComment || Number(parentComment.post_id) !== postId) return res.status(404).json({ error: 'Comment not found' });
    }
    const isAdmin = req.user.role === 'admin';
    const authorProfile = await db.get('users', req.user.id);
    const comment = await db.create('buzz_comments', {
      post_id: postId,
      parent_comment_id: parentCommentId,
      reply_to_name: parentComment?.author_name || null,
      user_id: String(req.user.firebase_uid),
      author_name: String(req.user.name || req.user.email || 'ChargerHub user').slice(0, 80),
      author_avatar_url: authorProfile?.avatar_url || null,
      author_handle: isAdmin ? '@chargerhub' : '',
      author_verified: isAdmin,
      content,
    });
    const updatedPost = await db.increment('buzz_posts', postId, 'comments_count');
    return res.status(201).json({ comment, comments_count: Number(updatedPost?.comments_count || post.comments_count || 0) });
  } catch (err) {
    console.error('Add Buzz comment error:', err);
    return res.status(500).json({ error: 'Could not add your comment' });
  }
};

export const deletePostComment = async (req, res) => {
  try {
    const postId = postIdFrom(req.params.id);
    const commentId = postIdFrom(req.params.commentId);
    if (!postId || !commentId) return res.status(404).json({ error: 'Comment not found' });

    const postRef = db.collection('buzz_posts').doc(String(postId));
    const commentRef = db.collection('buzz_comments').doc(String(commentId));
    const outcome = await db.store().runTransaction(async (transaction) => {
      const [postSnap, commentSnap] = await Promise.all([transaction.get(postRef), transaction.get(commentRef)]);
      if (!postSnap.exists || !commentSnap.exists) return { notFound: true };
      const post = postSnap.data();
      const comment = commentSnap.data();
      if (!visibleToCommunity(post) || Number(comment.post_id) !== postId) return { notFound: true };
      const isOwner = String(comment.user_id) === String(req.user.firebase_uid);
      if (!isOwner && req.user.role !== 'admin') return { forbidden: true };

      const commentsCount = Math.max(0, Number(post.comments_count || 0) - 1);
      transaction.delete(commentRef);
      transaction.set(postRef, { comments_count: commentsCount, updated_at: new Date().toISOString() }, { merge: true });
      return { comments_count: commentsCount };
    });
    if (outcome.notFound) return res.status(404).json({ error: 'Comment not found' });
    if (outcome.forbidden) return res.status(403).json({ error: 'You can delete only your own comment' });
    return res.json({ message: 'Comment deleted', comments_count: outcome.comments_count });
  } catch (err) {
    console.error('Delete Buzz comment error:', err);
    return res.status(500).json({ error: 'Could not delete this comment. Please try again.' });
  }
};
