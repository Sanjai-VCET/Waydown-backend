# Waydown Backend API

This document outlines the API endpoints for the Waydown backend application.

## Authentication

Handles user registration, login, and profile management.

*   **`POST /api/auth/register`**: Register a new user.
*   **`POST /api/auth/ensure-user`**: Ensure a user exists in the database after Firebase authentication.
*   **`GET /api/auth/status`**: Check the authentication status of the current user.
*   **`DELETE /api/auth/delete`**: Delete the current user's account.
*   **`DELETE /api/auth/delete/:uid`**: (Admin) Delete a user by their UID.
*   **`GET /api/auth/:id`**: Get a user by their MongoDB ID.
*   **`GET /api/auth/uid/:uid`**: Get a user by their Firebase UID.

## AI

Provides access to AI-powered features.

*   **`POST /api/ai/chat`**: Interact with the AI chat assistant.

## Community

Manages community-related features like posts, comments, and tags.

*   **`GET /api/community/posts`**: Fetch paginated approved posts.
*   **`GET /api/community/posts/:postId/comments`**: Fetch comments for a specific post.
*   **`POST /api/community/posts/:postId/like`**: Like or unlike a post.
*   **`POST /api/community/posts/:postId/comments`**: Add a comment to a post.
*   **`GET /api/community/tags/trending`**: Fetch trending tags.

## Errors

Handles error reporting from the client-side.

*   **`POST /api/errors/404`**: Log a 404 error from the client.

## Interests

Provides a list of available interests.

*   **`GET /api/interests/options`**: Get a list of available interest options.
*   **`GET /api/interests/categories`**: Get a list of available interest categories (alias for `/options`).

## Spots

Manages the core "spot" functionality, including creating, finding, and interacting with spots.

*   **`GET /api/spots`**: Fetch all approved spots with pagination.
*   **`POST /api/spots`**: Submit a new spot for review.
*   **`GET /api/spots/feed`**: Fetch a personalized feed of spots based on user interests.
*   **`GET /api/spots/admin/analytics`**: (Admin) Get analytics data for spots.
*   **`GET /api/spots/recommend`**: Fetch personalized spot recommendations.
*   **`GET /api/spots/trending`**: Fetch trending spots.
*   **`GET /api/spots/nearby`**: Fetch spots near a given location.
*   **`GET /api/spots/search`**: Search for spots by a query.
*   **`GET /api/spots/search/suggestions`**: Get search suggestions for spots.
*   **`GET /api/spots/tags/:tag`**: Fetch spots by a specific tag.
*   **`GET /api/spots/:id`**: Fetch a single spot by its ID.
*   **`GET /api/spots/:id/images`**: Fetch all images for a spot.
*   **`POST /api/spots/:id/images`**: Upload images to a spot.
*   **`GET /api/spots/:id/reviews`**: Fetch all reviews for a spot.
*   **`POST /api/spots/:id/reviews`**: Add a review to a spot.
*   **`GET /api/spots/:id/nearby`**: Fetch nearby spots for a given spot.
*   **`GET /api/spots/:id/360-view`**: Fetch 360-degree view data for a spot.
*   **`PUT /api/spots/:id`**: Update a spot.
*   **`PATCH /api/spots/:id/status`**: (Admin) Update the status of a spot (pending, approved, rejected).
*   **`DELETE /api/spots/:id`**: Delete a spot.
*   **`POST /api/spots/:id/like`**: Like a spot.
*   **`POST /api/spots/:id/unlike`**: Unlike a spot.
*   **`POST /api/spots/:id/report`**: Report a spot.

## Users

Manages user-related information and actions.

*   **`GET /api/users/profile`**: Get the current user's profile.
*   **`PUT /api/users/profile`**: Update the current user's profile.
*   **`POST /api/users/follow/:userId`**: Follow another user.
*   **`POST /api/users/unfollow/:userId`**: Unfollow another user.
*   **`GET /api/users/nearby`**: Fetch users near the current user's location.
*   **`GET /api/users/popular`**: Get a list of popular users.
*   **`GET /api/users/:uid/favorites`**: Get a user's favorite spots.
*   **`POST /api/users/:uid/avatar`**: Upload a user's avatar.
*   **`GET /api/users/:userId/followers`**: Fetch a user's followers.
*   **`GET /api/users/:userId/following`**: Fetch a user's following list.
*   **`GET /api/users/:uid`**: Get user details by UID.
*   **`POST /api/users/:uid/interests`**: Update a user's interests.
*   **`GET /api/users/:uid/interests`**: Get a user's interests.
*   **`POST /api/users/:uid/favorites`**: Add a spot to a user's favorites.
*   **`DELETE /api/users/:uid/favorites/:spotId`**: Remove a spot from a user's favorites.
*   **`GET /api/users/:uid/posts`**: Get all posts by a user.
*   **`GET /api/users/:uid/settings`**: Get a user's settings.
*   **`PUT /api/users/:uid/settings`**: Update a user's settings.
*   **`GET /api/users/:uid/analytics`**: (Admin) Get analytics for a user.
*   **`GET /api/users/admin/analytics`**: (Admin) Get analytics for all users.
*   **`PUT /api/users/:uid`**: Update a user's profile by UID.

## Welcome

Provides a welcome message for the API.

*   **`GET /api/welcome`**: Get a welcome message and API description.
