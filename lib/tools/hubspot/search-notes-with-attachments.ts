import { z } from "zod";
import { createProviderTool } from "../create-provider-tool";
import { ProviderApiHelper } from "../provider-api-helper";
import * as XLSX from 'xlsx';

export function createSearchNotesWithAttachmentsTool(server: any) {
  return createProviderTool(server, {
    name: "search_hubspot_notes_with_attachments",
    description: "Search HubSpot notes by query and return note content along with parsed attachment contents. Supports Excel (xlsx, xls) and CSV files. This tool is commonly used to retrieve customer-specific pricing information, approved item lists, and special pricing agreements that are regularly updated via spreadsheet attachments.",
    provider: "hubspot",
    schema: {
      query: z.string().describe("Search query to find in note body content (e.g., 'price book', 'pricing', 'approved items', 'special rates')"),
      associatedObjectType: z.union([
        z.enum(["contact", "company", "deal"]),
        z.literal(""),
        z.undefined()
      ]).optional().transform(val => val === "" ? undefined : val).describe("Filter by associated object type"),
      associatedObjectId: z.string().optional().transform(val => val === "" ? undefined : val).describe("Filter by specific associated object ID"),
      maxResults: z.number().optional().default(10).describe("Maximum number of notes to return (default: 10)"),
      includeArchived: z.boolean().optional().default(false).describe("Include archived notes (default: false)"),
      maxRowsPerFile: z.number().optional().default(50).describe("Maximum rows to return per spreadsheet file (default: 50)")
    },
    handler: async ({ query, associatedObjectType, associatedObjectId, maxResults, includeArchived, maxRowsPerFile }, context) => {
      const api = new ProviderApiHelper(context);
      
      try {
        // Build search filters
        const filters: any[] = [];
        
        // Add query filter if provided
        // Note: hs_note_body might contain HTML, so we'll search more broadly
        if (query) {
          // Try to search in the note body - using CONTAINS_TOKEN for partial matches
          filters.push({
            propertyName: "hs_note_body",
            operator: "CONTAINS_TOKEN", 
            value: query
          });
        }
        
        // Add association filter if provided
        // Check for non-empty strings as MCP might pass empty strings instead of undefined
        if (associatedObjectType && associatedObjectType.trim() && associatedObjectId && associatedObjectId.trim()) {
          filters.push({
            propertyName: `associations.${associatedObjectType}`,
            operator: "EQ",
            value: associatedObjectId
          });
        }
        
        // Search for notes
        const searchBody = {
          filterGroups: filters.length > 0 ? [{ filters }] : [],
          properties: ["hs_note_body", "hs_attachment_ids", "hs_timestamp", "hs_createdate", "hs_lastmodifieddate"],
          limit: maxResults,
          sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }]
        };

        // Remove the archived filter for now as it might be causing issues
        // TODO: Investigate the correct property for filtering archived notes

        const notesResponse = await api.post('/crm/v3/objects/notes/search', 'search_notes', searchBody);
        
        if (!notesResponse.data.results || notesResponse.data.results.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No notes found matching the search criteria."
            }]
          };
        }

        // Process each note and its attachments
        const processedNotes = await Promise.all(notesResponse.data.results.map(async (note: any) => {
          const noteData: any = {
            id: note.id,
            createdAt: note.properties.hs_createdate,
            updatedAt: note.properties.hs_lastmodifieddate,
            timestamp: note.properties.hs_timestamp,
            body: note.properties.hs_note_body ? cleanHtmlContent(note.properties.hs_note_body) : null,
            attachments: []
          };

          // Process attachments if any
          if (note.properties.hs_attachment_ids) {
            const attachmentIds = note.properties.hs_attachment_ids.split(';').filter(Boolean);
            
            // Process attachments concurrently with a limit to avoid overwhelming the API
            const ATTACHMENT_CONCURRENCY_LIMIT = 3;
            
            // Create promises for each attachment with inline processing
            const attachmentPromises = attachmentIds.map(async (attachmentId: string, index: number) => {
              // Add a small delay based on index to avoid hitting rate limits
              const delay = Math.floor(index / ATTACHMENT_CONCURRENCY_LIMIT) * 100;
              if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              try {
                // Get file metadata
                const fileInfoResponse = await api.get(`/files/v3/files/${attachmentId}`, 'get_file_info');
                const fileInfo = fileInfoResponse.data;
                
                const attachmentData: any = {
                  id: fileInfo.id,
                  name: fileInfo.name,
                  extension: fileInfo.extension,
                  size: fileInfo.size,
                  type: fileInfo.type
                };

                // If it's a spreadsheet file, parse its contents
                if (fileInfo.extension && ['xlsx', 'xls', 'csv'].includes(fileInfo.extension.toLowerCase())) {
                  try {
                    // Get signed download URL
                    const signedUrlResponseData = await api.get(`/files/v3/files/${attachmentId}/signed-url`, 'get_signed_url');
                    const signedUrlResponse = signedUrlResponseData.data;
                    
                    // Download file
                    const downloadResponse = await fetch(signedUrlResponse.url);
                    if (!downloadResponse.ok) {
                      throw new Error(`Failed to download: ${downloadResponse.status}`);
                    }

                    const arrayBuffer = await downloadResponse.arrayBuffer();
                    
                    // Parse based on file type
                    let parsedData: any;
                    if (fileInfo.extension.toLowerCase() === 'csv') {
                      // For CSV, convert to text first
                      const text = new TextDecoder().decode(arrayBuffer);
                      const workbook = XLSX.read(text, { type: 'string' });
                      parsedData = parseWorkbook(workbook, maxRowsPerFile);
                    } else {
                      // For Excel files
                      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                      parsedData = parseWorkbook(workbook, maxRowsPerFile);
                    }
                    
                    attachmentData.content = parsedData;
                  } catch (parseError: any) {
                    attachmentData.parseError = `Failed to parse file: ${parseError.message}`;
                  }
                }

                return attachmentData;
              } catch (attachmentError: any) {
                throw attachmentError;
              }
            });
            
            const attachmentResults = await Promise.allSettled(attachmentPromises);
            
            // Process results and maintain order
            attachmentResults.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                noteData.attachments.push(result.value);
              } else {
                noteData.attachments.push({
                  id: attachmentIds[index],
                  error: `Failed to process attachment: ${result.reason?.message || 'Unknown error'}`
                });
              }
            });
          }

          return noteData;
        }));

        // Format the response
        const response = {
          total: notesResponse.data.total,
          notes: processedNotes
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response, null, 2)
          }]
        };

      } catch (error: any) {
        throw new Error(`Failed to search notes: ${error.message}`);
      }
    }
  });
}


// Helper function to clean HTML content
function cleanHtmlContent(html: string): string {
  // Remove HTML tags and decode entities
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Helper function to parse workbook
function parseWorkbook(workbook: XLSX.WorkBook, maxRows: number): any {
  const result: any = {
    sheets: {}
  };

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: null,
      blankrows: false 
    }) as any[][];

    if (jsonData.length === 0) {
      result.sheets[sheetName] = { empty: true };
      continue;
    }

    // Try to detect if first row is headers
    const firstRow = jsonData[0];
    const hasHeaders = firstRow.some(cell => 
      cell && typeof cell === 'string' && isNaN(Number(cell))
    );

    if (hasHeaders && jsonData.length > 1) {
      // Standard format with headers
      const headers = firstRow;
      const rows = jsonData.slice(1, maxRows + 1);
      
      result.sheets[sheetName] = {
        headers,
        rowCount: Math.min(rows.length, maxRows),
        totalRows: jsonData.length - 1,
        data: rows.map((row, index) => {
          const rowObj: any = { _row: index + 2 };
          headers.forEach((header, colIndex) => {
            if (header) {
              rowObj[header] = row[colIndex] ?? null;
            }
          });
          return rowObj;
        })
      };
    } else {
      // No clear headers, return as array
      result.sheets[sheetName] = {
        rowCount: Math.min(jsonData.length, maxRows),
        totalRows: jsonData.length,
        data: jsonData.slice(0, maxRows).map((row, index) => ({
          _row: index + 1,
          values: row
        }))
      };
    }

    // Add truncation note if needed
    if (jsonData.length > maxRows + (hasHeaders ? 1 : 0)) {
      result.sheets[sheetName].truncated = true;
      result.sheets[sheetName].truncationNote = `Showing first ${maxRows} rows of ${jsonData.length - (hasHeaders ? 1 : 0)} total rows`;
    }
  }

  return result;
}