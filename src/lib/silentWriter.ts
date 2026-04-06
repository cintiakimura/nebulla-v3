
/**
 * Silent writer utility for updating the Nebula Architecture Spec.md
 */
export async function writeToSpec(content: string) {
  try {
    const response = await fetch('/api/write-spec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    return response.ok;
  } catch (error) {
    console.error('Silent Writer Error:', error);
    return false;
  }
}
