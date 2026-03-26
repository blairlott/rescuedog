import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHOPIFY_ADMIN_URL = 'https://rescuedogwines.myshopify.com/admin/api/2025-07/graphql.json';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SHOPIFY_ACCESS_TOKEN = Deno.env.get('SHOPIFY_ACCESS_TOKEN');
    if (!SHOPIFY_ACCESS_TOKEN) {
      throw new Error('SHOPIFY_ACCESS_TOKEN is not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filename = file.name;
    const fileSize = file.size;
    const mimeType = file.type || 'image/jpeg';

    // Step 1: Create staged upload
    const stagedUploadRes = await fetch(SHOPIFY_ADMIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `
          mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
            stagedUploadsCreate(input: $input) {
              stagedTargets {
                url
                resourceUrl
                parameters {
                  name
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          input: [{
            resource: "FILE",
            filename,
            mimeType,
            fileSize: String(fileSize),
            httpMethod: "POST",
          }],
        },
      }),
    });

    const stagedData = await stagedUploadRes.json();
    console.log('Staged upload response:', JSON.stringify(stagedData));

    if (stagedData.errors?.length) {
      throw new Error(`Shopify staged upload error: ${JSON.stringify(stagedData.errors)}`);
    }

    const userErrors = stagedData.data?.stagedUploadsCreate?.userErrors;
    if (userErrors?.length) {
      throw new Error(`Staged upload user errors: ${JSON.stringify(userErrors)}`);
    }

    const target = stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];
    if (!target) {
      throw new Error('No staged upload target returned');
    }

    // Step 2: Upload file to staged target
    const uploadForm = new FormData();
    for (const param of target.parameters) {
      uploadForm.append(param.name, param.value);
    }
    uploadForm.append('file', file);

    const uploadRes = await fetch(target.url, {
      method: 'POST',
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`Failed to upload to staged target [${uploadRes.status}]: ${errorText}`);
    }

    // Step 3: Create file in Shopify
    const fileCreateRes = await fetch(SHOPIFY_ADMIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files {
                ... on MediaImage {
                  id
                  image {
                    url
                  }
                }
                ... on GenericFile {
                  id
                  url
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          files: [{
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
          }],
        },
      }),
    });

    const fileData = await fileCreateRes.json();
    console.log('File create response:', JSON.stringify(fileData));

    const fileUserErrors = fileData.data?.fileCreate?.userErrors;
    if (fileUserErrors?.length) {
      throw new Error(`File create errors: ${JSON.stringify(fileUserErrors)}`);
    }

    const createdFile = fileData.data?.fileCreate?.files?.[0];
    // The image URL may not be immediately available (Shopify processes async)
    // Return the resourceUrl as fallback
    const imageUrl = createdFile?.image?.url || createdFile?.url || target.resourceUrl;

    // Step 4: Poll for the processed image URL if it's not ready yet
    let finalUrl = imageUrl;
    if (createdFile?.id && !createdFile?.image?.url) {
      // Poll up to 5 times with 2s delay
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(SHOPIFY_ADMIN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            query: `
              query getFile($id: ID!) {
                node(id: $id) {
                  ... on MediaImage {
                    image {
                      url
                    }
                    fileStatus
                  }
                }
              }
            `,
            variables: { id: createdFile.id },
          }),
        });
        const pollData = await pollRes.json();
        const polledUrl = pollData.data?.node?.image?.url;
        const status = pollData.data?.node?.fileStatus;
        console.log(`Poll ${i + 1}: status=${status}, url=${polledUrl}`);
        if (polledUrl) {
          finalUrl = polledUrl;
          break;
        }
        if (status === 'FAILED') {
          throw new Error('Shopify file processing failed');
        }
      }
    }

    return new Response(JSON.stringify({ url: finalUrl }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Upload error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
