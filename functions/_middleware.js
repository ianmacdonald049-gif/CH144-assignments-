export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pagePath = url.pathname; // Tracks the specific assignment file path

  // 1. Check for an existing tracking cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map(c => c.trim().split("="))
  );

  let studentToken = cookies["assignment_tracker_id"];
  let isNewStudent = false;

  // 2. Assign a unique token if this is their first time visiting
  if (!studentToken) {
    studentToken = crypto.randomUUID();
    isNewStudent = true;
  }

  // 3. Create a unique database key for this specific student + specific page
  const storageKey = `student:${studentToken}:page:${pagePath}`;

  // 4. Retrieve current view count from Cloudflare KV
  let accessCount = parseInt(await env.LIMITER_KV.get(storageKey)) || 0;

  // 5. Block the request if they have already viewed it 2 times
  if (accessCount >= 2) {
    return new Response(
      `Access Denied: You have reached your limit of 2 views for this assignment (${pagePath.split('/').pop()}).`, 
      {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      }
    );
  }

  // 6. Increment and save the new count (expires in 14 days so database stays clean)
  accessCount++;
  await env.LIMITER_KV.put(storageKey, accessCount.toString(), { expirationTtl: 1209600 });

  // 7. Fetch the actual static HTML page
  const response = await context.next();

  // 8. If new, attach the secure browser cookie to the response
  if (isNewStudent) {
    const newResponse = new Response(response.body, response);
    newResponse.headers.append(
      "Set-Cookie", 
      `assignment_tracker_id=${studentToken}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict`
    );
    return newResponse;
  }

  return response;
}
